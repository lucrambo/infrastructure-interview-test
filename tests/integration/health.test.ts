import request from "supertest";
import type { DataSource } from "typeorm";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import type { DatabaseConfig } from "../../src/config";
import { createDataSource } from "../../src/database";
import { captureLogger, createTestDatabase } from "../helpers";

let db: DatabaseConfig;

beforeAll(async () => {
  db = await createTestDatabase();
});

async function connected(): Promise<DataSource> {
  const dataSource = createDataSource(db);
  await dataSource.initialize();
  return dataSource;
}

function expectNotReady(res: request.Response): void {
  expect(res.status).toBe(503);
  expect(res.headers["content-type"]).toMatch(/^application\/problem\+json/);
  expect(res.body).toMatchObject({
    type: "about:blank",
    title: "Service Unavailable",
    status: 503,
  });
}

describe("healthz", () => {
  it("answers 200 while the database is connected", async () => {
    const dataSource = await connected();
    const app = createApp({ dataSource, logger: captureLogger().logger });
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    await dataSource.destroy();
  });

  it("answers 200 without touching the database, even after it is gone", async () => {
    const dataSource = await connected();
    await dataSource.destroy();
    const app = createApp({ dataSource, logger: captureLogger().logger });
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("readyz ready", () => {
  it("answers 200 when SELECT 1 succeeds", async () => {
    const dataSource = await connected();
    const app = createApp({ dataSource, logger: captureLogger().logger });
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    await dataSource.destroy();
  });
});

describe("readyz not ready", () => {
  it("answers 503 when the database connection is gone", async () => {
    const dataSource = await connected();
    await dataSource.destroy();
    const app = createApp({ dataSource, logger: captureLogger().logger });
    expectNotReady(await request(app).get("/readyz"));
  });

  it("answers 503 after 1 second when the database does not answer", async () => {
    const hanging = { query: () => new Promise<never>(() => undefined) } as unknown as DataSource;
    const app = createApp({ dataSource: hanging, logger: captureLogger().logger });
    const started = Date.now();
    expectNotReady(await request(app).get("/readyz"));
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(950);
    expect(elapsed).toBeLessThan(2000);
  });

  it("answers 503 while draining, with the database still up", async () => {
    const dataSource = await connected();
    const app = createApp({ dataSource, logger: captureLogger().logger, isDraining: () => true });
    const res = await request(app).get("/readyz");
    expectNotReady(res);
    expect(res.headers.connection).toBe("close");
    await dataSource.destroy();
  });
});
