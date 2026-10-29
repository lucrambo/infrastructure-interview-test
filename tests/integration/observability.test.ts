import request from "supertest";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { captureLogger, createTestDatabase, migratedDataSource } from "../helpers";

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await migratedDataSource(await createTestDatabase());
});

afterAll(async () => {
  await dataSource.destroy();
});

describe("access log", () => {
  it("writes one JSON line per request with the agreed fields and no secrets", async () => {
    const captured = captureLogger();
    const app = createApp({ dataSource, logger: captured.logger });
    const res = await request(app)
      .post("/posts?source=test")
      .set("Authorization", "Bearer token-secret")
      .set("Cookie", "sid=cookie-secret")
      .set("X-Request-Id", "req-1")
      .send({ title: "body-secret", text: "body-secret" });
    expect(res.status).toBe(201);

    const lines = captured.lines();
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toMatchObject({
      level: "info",
      requestId: "req-1",
      method: "POST",
      url: "/posts?source=test",
      statusCode: 201,
    });
    expect(typeof line?.time).toBe("string");
    expect(new Date(String(line?.time)).toISOString()).toBe(line?.time);
    expect(typeof line?.responseTime).toBe("number");
    expect(captured.raw()).not.toMatch(/token-secret|cookie-secret|body-secret/);
  });

  it("logs 5xx responses at error level", async () => {
    const captured = captureLogger();
    const broken = {
      getRepository: () => ({ find: () => Promise.reject(new Error("boom")) }),
    } as never;
    const app = createApp({ dataSource: broken, logger: captured.logger });
    await request(app).get("/posts").expect(500);
    const line = captured.lines().find((l) => l.msg === "request completed");
    expect(line).toMatchObject({ level: "error", statusCode: 500 });
  });

  it("writes nothing for probe and metrics requests", async () => {
    const captured = captureLogger();
    const app = createApp({ dataSource, logger: captured.logger });
    await request(app).get("/healthz").expect(200);
    await request(app).get("/readyz").expect(200);
    await request(app).get("/metrics").expect(200);
    expect(captured.lines()).toEqual([]);
  });
});

describe("metrics", () => {
  it("exposes process metrics and a request histogram labelled by route template", async () => {
    const app = createApp({ dataSource, logger: captureLogger().logger });
    await request(app).get("/posts/7").expect(404);
    await request(app).get("/posts").expect(200);
    await request(app).get("/no/such/path").expect(404);

    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/plain; version=0\.0\.4/);
    expect(res.text).toContain("process_cpu_user_seconds_total");
    expect(res.text).toContain("nodejs_eventloop_lag_seconds");
    expect(res.text).toMatch(
      /http_request_duration_seconds_count\{method="GET",route="\/posts\/:id",status_code="404"\} 1/,
    );
    expect(res.text).toMatch(
      /http_request_duration_seconds_count\{method="GET",route="\/posts",status_code="200"\} 1/,
    );
    expect(res.text).toMatch(/route="unmatched"/);
    expect(res.text).not.toContain("/posts/7");
    expect(res.text).not.toContain("/no/such/path");
  });
});
