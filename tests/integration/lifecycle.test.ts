import { EventEmitter } from "node:events";
import { request as httpRequest, type IncomingMessage } from "node:http";
import supertest from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Config, DatabaseConfig } from "../../src/config";
import { createDataSource } from "../../src/database";
import { start, type Running } from "../../src/server";
import { captureLogger, createTestDatabase, freePort, migratedDataSource } from "../helpers";

let db: DatabaseConfig;
const cleanups: (() => void)[] = [];

beforeAll(async () => {
  db = await createTestDatabase();
  await (await migratedDataSource(db)).destroy();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function boot(shutdownTimeoutMs = 25000) {
  const config: Config = { port: await freePort(), logLevel: "info", shutdownTimeoutMs, db };
  const exit = vi.fn<(code: number) => void>();
  const signals = new EventEmitter();
  const dataSource = createDataSource(db);
  const running = await start({
    config,
    logger: captureLogger().logger,
    exit,
    signals,
    dataSource,
  });
  cleanups.push(() => {
    running.server.closeAllConnections();
    running.server.close();
  });
  return { running, exit, signals, dataSource };
}

/** Sends the headers and half the body of a POST, so the request stays in flight. */
function startSlowPost(running: Running) {
  const body = JSON.stringify({ title: "in flight", text: "completes" });
  const half = Math.floor(body.length / 2);
  const req = httpRequest({
    port: running.port,
    method: "POST",
    path: "/posts",
    headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
  });
  const response = new Promise<IncomingMessage & { body: string }>((resolve, reject) => {
    req.on("response", (res) => {
      let text = "";
      res.on("data", (chunk: Buffer) => (text += chunk.toString()));
      res.on("end", () => {
        resolve(Object.assign(res, { body: text }));
      });
    });
    req.on("error", reject);
  });
  req.write(body.slice(0, half));
  cleanups.push(() => req.destroy());
  return { finish: () => req.end(body.slice(half)), response };
}

async function connectionRefused(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest({ port, path: "/healthz" }, (res) => {
      res.resume();
      resolve(false);
    });
    req.on("error", (err: NodeJS.ErrnoException) => {
      resolve(err.code === "ECONNREFUSED");
    });
    req.end();
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

describe("lifecycle", () => {
  it.each(["SIGTERM", "SIGINT"])(
    "drains on %s: not ready, no new connections, in-flight request completes, exit 0",
    async (signal) => {
      const { running, exit, signals, dataSource } = await boot();
      const slow = startSlowPost(running);
      await settle();

      signals.emit(signal);
      await settle();

      await supertest(running.app).get("/readyz").expect(503);
      expect(await connectionRefused(running.port)).toBe(true);
      expect(exit).not.toHaveBeenCalled();

      slow.finish();
      const res = await slow.response;
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body)).toMatchObject({ title: "in flight" });

      await vi.waitFor(() => {
        expect(exit).toHaveBeenCalledWith(0);
      });
      expect(exit).toHaveBeenCalledTimes(1);
      expect(dataSource.isInitialized).toBe(false);
    },
  );

  it("shutdown timeout exits 1 when a request never finishes", async () => {
    const { running, exit, signals } = await boot(500);
    // this request never completes: the cleanup destroys its socket
    startSlowPost(running).response.catch(() => undefined);
    await settle();

    const started = Date.now();
    signals.emit("SIGTERM");
    await vi.waitFor(
      () => {
        expect(exit).toHaveBeenCalledWith(1);
      },
      { timeout: 3000 },
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    expect(exit).not.toHaveBeenCalledWith(0);
  });
});
