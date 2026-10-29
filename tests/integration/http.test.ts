import request from "supertest";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { createDataSource } from "../../src/database";
import { captureLogger, createTestDatabase, migratedDataSource } from "../helpers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let dataSource: DataSource;
let unmigrated: DataSource;

beforeAll(async () => {
  dataSource = await migratedDataSource(await createTestDatabase());
  // a database without tables makes every query fail the way a broken dependency does
  unmigrated = createDataSource(await createTestDatabase());
  await unmigrated.initialize();
});

afterAll(async () => {
  await dataSource.destroy();
  await unmigrated.destroy();
});

describe("http", () => {
  it("unknown route answers 404 problem+json", async () => {
    const app = createApp({ dataSource, logger: captureLogger().logger });
    for (const res of [await request(app).get("/nope"), await request(app).delete("/posts/1")]) {
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toMatch(/^application\/problem\+json/);
      expect(res.body).toMatchObject({ type: "about:blank", title: "Not Found", status: 404 });
    }
  });

  it("unexpected error answers 500 without internals and logs it with the request id", async () => {
    const captured = captureLogger();
    const app = createApp({ dataSource: unmigrated, logger: captured.logger });
    const res = await request(app).get("/posts");
    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(res.body).toEqual({ type: "about:blank", title: "Internal Server Error", status: 500 });
    expect(res.text).not.toMatch(/ER_|SELECT|doesn't exist|\.ts:\d+|post/i);
    const logged = captured.lines().find((line) => line.msg === "unhandled error");
    expect(logged).toMatchObject({ level: "error", requestId: res.headers["x-request-id"] });
    expect(JSON.stringify(logged)).toMatch(/doesn't exist/);
  });

  it.each([
    ["a valid incoming id is echoed", "abc-123_X.y", "abc-123_X.y"],
    ["an id of 128 characters is echoed", "a".repeat(128), "a".repeat(128)],
    ["an id of 129 characters is replaced", "a".repeat(129), UUID],
    ["an id with forbidden characters is replaced", "bad id!", UUID],
  ])("request id: %s", async (_case, incoming, expected) => {
    const app = createApp({ dataSource, logger: captureLogger().logger });
    const res = await request(app).get("/healthz").set("X-Request-Id", incoming);
    if (typeof expected === "string") expect(res.headers["x-request-id"]).toBe(expected);
    else expect(res.headers["x-request-id"]).toMatch(expected);
  });

  it("request id: a missing id is generated on success and error responses", async () => {
    const app = createApp({ dataSource, logger: captureLogger().logger });
    for (const path of ["/posts", "/posts/abc", "/nope"]) {
      expect((await request(app).get(path)).headers["x-request-id"]).toMatch(UUID);
    }
  });

  it("security headers are set and X-Powered-By is not", async () => {
    const app = createApp({ dataSource, logger: captureLogger().logger });
    for (const path of ["/posts", "/nope", "/healthz"]) {
      const res = await request(app).get(path);
      expect(res.headers["x-powered-by"]).toBeUndefined();
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    }
  });
});
