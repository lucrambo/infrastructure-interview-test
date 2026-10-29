import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  dbEnv,
  freePort,
  jsonLines,
  runServer,
  serverEnv,
  startServer,
  tableNames,
} from "../helpers";

const required = {
  DB_HOST: "127.0.0.1",
  DB_USER: "app",
  DB_PASSWORD: "s3cr3t",
  DB_NAME: "posts",
};

const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

describe("boot with invalid configuration", () => {
  it.each([
    ["DB_HOST unset", { DB_HOST: "" }, ["DB_HOST"]],
    ["DB_PORT=abc", { DB_PORT: "abc" }, ["DB_PORT"]],
    ["DB_PORT=65536", { DB_PORT: "65536" }, ["DB_PORT"]],
    ["DB_HOST and DB_NAME unset", { DB_HOST: "", DB_NAME: "" }, ["DB_HOST", "DB_NAME"]],
  ])("%s exits 1 with one JSON line naming it", async (_case, override, variables) => {
    const result = await runServer(serverEnv({ ...required, ...override }));
    expect(result.code).toBe(1);
    const lines = jsonLines(result.output);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "fatal", msg: "invalid configuration", variables });
    expect(result.output).not.toContain("s3cr3t");
  });
});

describe("boot with an unreachable database", () => {
  it.each([
    ["a closed port", { DB_HOST: "127.0.0.1", DB_PORT: "1" }],
    // a non-routable address never answers, so only the connect timeout ends the attempt
    ["an address that never answers", { DB_HOST: "10.255.255.1", DB_PORT: "3306" }],
  ])("%s exits 1 within 15 seconds and logs the error", async (_case, target) => {
    const result = await runServer(serverEnv({ ...required, ...target }), 20_000);
    expect(result.code).toBe(1);
    expect(result.elapsedMs).toBeLessThan(15_000);
    const fatal = jsonLines(result.output).find((line) => line.level === "fatal");
    expect(fatal).toMatchObject({ msg: "startup failed" });
    expect(typeof (fatal?.err as { message?: unknown } | undefined)?.message).toBe("string");
    expect(result.output).not.toContain("s3cr3t");
  });
});

describe("boot with DB_SSL", () => {
  it("DB_SSL=true refuses a server whose certificate cannot be verified", async () => {
    // the MySQL image serves TLS with a self-signed certificate
    const db = await createTestDatabase();
    const result = await runServer(serverEnv({ ...dbEnv(db), DB_SSL: "true" }));
    expect(result.code).toBe(1);
    const fatal = jsonLines(result.output).find((line) => line.level === "fatal");
    expect(JSON.stringify(fatal)).toMatch(/certificate/i);
  });

  it("DB_SSL=false connects without TLS", async () => {
    const db = await createTestDatabase();
    const port = await freePort();
    const child = await startServer(serverEnv({ ...dbEnv(db), PORT: String(port) }));
    children.push(child);
    const res = await fetch(`http://127.0.0.1:${port}/readyz`);
    expect(res.status).toBe(200);
  });
});

describe("boot against an empty database", () => {
  it("creates no table and still reports ready", async () => {
    const db = await createTestDatabase();
    const port = await freePort();
    const child = await startServer(serverEnv({ ...dbEnv(db), PORT: String(port) }));
    children.push(child);
    const res = await fetch(`http://127.0.0.1:${port}/readyz`);
    expect(res.status).toBe(200);
    expect(await tableNames(db)).toEqual([]);
  });
});
