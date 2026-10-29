import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/config";

const required = { DB_HOST: "db", DB_USER: "app", DB_PASSWORD: "secret", DB_NAME: "posts" };

function errorOf(env: NodeJS.ProcessEnv): ConfigError {
  try {
    loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) return err;
    throw err;
  }
  throw new Error("expected a ConfigError");
}

describe("config", () => {
  it("applies the documented defaults when only the required variables are set", () => {
    expect(loadConfig(required)).toEqual({
      port: 3000,
      logLevel: "info",
      shutdownTimeoutMs: 25000,
      db: {
        host: "db",
        port: 3306,
        user: "app",
        password: "secret",
        name: "posts",
        ssl: false,
        poolMax: 10,
        queryTimeoutMs: 5000,
      },
    });
  });

  it("reads every variable from the environment", () => {
    const config = loadConfig({
      ...required,
      PORT: "8080",
      LOG_LEVEL: "debug",
      SHUTDOWN_TIMEOUT_MS: "5000",
      DB_PORT: "3307",
      DB_SSL: "true",
      DB_POOL_MAX: "20",
      DB_QUERY_TIMEOUT_MS: "2000",
    });
    expect(config).toEqual({
      port: 8080,
      logLevel: "debug",
      shutdownTimeoutMs: 5000,
      db: {
        host: "db",
        port: 3307,
        user: "app",
        password: "secret",
        name: "posts",
        ssl: true,
        poolMax: 20,
        queryTimeoutMs: 2000,
      },
    });
  });

  it.each(["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"])("requires %s", (name) => {
    const env: NodeJS.ProcessEnv = { ...required };
    Reflect.deleteProperty(env, name);
    expect(errorOf(env).variables).toEqual([name]);
  });

  it("accepts the largest shutdown timeout a timer can hold and the largest pool", () => {
    const config = loadConfig({
      ...required,
      SHUTDOWN_TIMEOUT_MS: "2147483647",
      DB_POOL_MAX: "1000",
    });
    expect(config.shutdownTimeoutMs).toBe(2147483647);
    expect(config.db.poolMax).toBe(1000);
  });

  it("treats an empty string as unset", () => {
    expect(loadConfig({ ...required, PORT: "" }).port).toBe(3000);
    expect(errorOf({ ...required, DB_HOST: "" }).variables).toEqual(["DB_HOST"]);
  });

  it.each([
    ["PORT", "0"],
    ["PORT", "65536"],
    ["DB_PORT", "abc"],
    ["DB_PORT", "0x50"],
    ["DB_PORT", "1e3"],
    ["DB_PORT", " 80"],
    ["DB_PORT", "-1"],
    ["SHUTDOWN_TIMEOUT_MS", "2147483648"],
    ["SHUTDOWN_TIMEOUT_MS", "0"],
    ["DB_POOL_MAX", "1001"],
    ["DB_QUERY_TIMEOUT_MS", "99"],
    ["DB_QUERY_TIMEOUT_MS", "600001"],
    ["DB_SSL", "yes"],
    ["DB_POOL_MAX", "0"],
    ["SHUTDOWN_TIMEOUT_MS", "-1"],
    ["LOG_LEVEL", "verbose"],
  ])("rejects %s=%s", (name, value) => {
    expect(errorOf({ ...required, [name]: value }).variables).toEqual([name]);
  });

  it("names every offending variable and never a value", () => {
    const err = errorOf({ DB_PASSWORD: "s3cr3t", DB_PORT: "abc" });
    expect(err.variables).toEqual(["DB_HOST", "DB_NAME", "DB_PORT", "DB_USER"]);
    expect(err.message).not.toContain("s3cr3t");
  });
});
