import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { Writable } from "node:stream";
import mysql from "mysql2/promise";
import type { DataSource } from "typeorm";
import { inject } from "vitest";
import type { DatabaseConfig } from "../src/config";
import { createDataSource } from "../src/database";
import { createLogger, type Logger } from "../src/logger";
import "./mysql";

export function server() {
  return inject("mysql");
}

async function rootConnection() {
  const { host, port, rootPassword } = server();
  return mysql.createConnection({ host, port, user: "root", password: rootPassword });
}

/** A database of its own for each test file, so files can run in parallel. */
export async function createTestDatabase(): Promise<DatabaseConfig> {
  const name = `test_${randomBytes(6).toString("hex")}`;
  const connection = await rootConnection();
  try {
    await connection.query(`CREATE DATABASE \`${name}\``);
  } finally {
    await connection.end();
  }
  const { host, port, rootPassword } = server();
  return {
    host,
    port,
    user: "root",
    password: rootPassword,
    name,
    ssl: false,
    poolMax: 5,
    queryTimeoutMs: 5000,
  };
}

export async function query<T = Record<string, unknown>>(
  db: DatabaseConfig,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const connection = await mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.name,
  });
  try {
    const [rows] = await connection.query(sql, values);
    return rows as T[];
  } finally {
    await connection.end();
  }
}

export async function tableNames(db: DatabaseConfig): Promise<string[]> {
  const rows = await query<{ name: string }>(
    db,
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? ORDER BY 1",
    [db.name],
  );
  return rows.map((row) => row.name);
}

export async function migratedDataSource(db: DatabaseConfig): Promise<DataSource> {
  const dataSource = createDataSource(db);
  await dataSource.initialize();
  await dataSource.runMigrations();
  return dataSource;
}

/**
 * Empties every table and restarts ids at 1. `FOREIGN_KEY_CHECKS` is a session variable, so every
 * statement runs on the same connection.
 */
export async function resetTables(dataSource: DataSource): Promise<void> {
  const runner = dataSource.createQueryRunner();
  try {
    await runner.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of ["post_categories_category", "category", "post"]) {
      await runner.query(`TRUNCATE TABLE \`${table}\``);
    }
    await runner.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await runner.release();
  }
}

export interface CapturedLogger {
  logger: Logger;
  lines: () => Record<string, unknown>[];
  raw: () => string;
}

export function captureLogger(): CapturedLogger {
  let buffer = "";
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  });
  return {
    logger: createLogger("info", stream),
    raw: () => buffer,
    lines: () =>
      buffer
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() => {
        if (typeof address === "object" && address !== null) resolve(address.port);
        else reject(new Error("no port"));
      });
    });
  });
}

/** Environment for a spawned server: the parent's, minus every variable the service reads. */
export function serverEnv(vars: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(DB_|PORT$|LOG_LEVEL$|SHUTDOWN_TIMEOUT_MS$)/.test(key)) Reflect.deleteProperty(env, key);
  }
  return { ...env, ...vars };
}

export function dbEnv(db: DatabaseConfig): Record<string, string> {
  return {
    DB_HOST: db.host,
    DB_PORT: String(db.port),
    DB_USER: db.user,
    DB_PASSWORD: db.password,
    DB_NAME: db.name,
  };
}

export interface Exited {
  code: number | null;
  output: string;
  elapsedMs: number;
}

/** Runs `node dist/server.js` and waits for it to exit. */
export async function runServer(env: NodeJS.ProcessEnv, timeoutMs = 30_000): Promise<Exited> {
  const started = Date.now();
  const child = spawn(process.execPath, ["dist/server.js"], { env });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("exit", (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  return { code, output, elapsedMs: Date.now() - started };
}

/** Starts `node dist/server.js` and resolves once it logs that it is listening. */
export async function startServer(env: NodeJS.ProcessEnv): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["dist/server.js"], { env });
  let output = "";
  await new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('"msg":"listening"')) resolve();
    });
    child.on("exit", (code) => {
      reject(new Error(`server exited with ${String(code)}: ${output}`));
    });
  });
  return child;
}

export function jsonLines(output: string): Record<string, unknown>[] {
  return output
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
