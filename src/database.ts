import "reflect-metadata";
import { DataSource, type DataSourceOptions } from "typeorm";
import type { DatabaseConfig } from "./config";
import { Category } from "./entity/Category";
import { Post } from "./entity/Post";
import { InitialSchema1761696000000 } from "./migration/1761696000000-InitialSchema";

/** Connection attempts give up after this long, so a boot against a dead database fails fast. */
const CONNECT_TIMEOUT_MS = 10_000;

export function dataSourceOptions(db: DatabaseConfig): DataSourceOptions {
  return {
    type: "mysql",
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.name,
    charset: "utf8mb4",
    // Verified TLS only: a managed database (RDS) presents a certificate from a public CA bundle.
    ssl: db.ssl ? { rejectUnauthorized: true } : undefined,
    connectTimeout: CONNECT_TIMEOUT_MS,
    poolSize: db.poolMax,
    // a connection to a database node that vanished (zone outage, failover) never answers; the
    // timeout fails the query and drops the connection, so the pool reconnects to a live one
    enableQueryTimeout: true,
    maxQueryExecutionTime: db.queryTimeoutMs,
    entities: [Post, Category],
    migrations: [InitialSchema1761696000000],
    migrationsTableName: "migrations",
    // The schema belongs to migrations, run as an explicit release step (plan door 6).
    synchronize: false,
    migrationsRun: false,
  };
}

export function createDataSource(db: DatabaseConfig): DataSource {
  return new DataSource(dataSourceOptions(db));
}

type QueryCallback = (err: { code?: string } | null, ...rest: unknown[]) => void;

interface PooledConnection {
  query: (...args: unknown[]) => unknown;
  destroy: () => void;
}

const guarded = new WeakSet<PooledConnection>();

/**
 * mysql2 only rejects a query that times out: the connection stays busy waiting for an answer
 * that, from a vanished server, never comes, and the pool keeps handing it out. Destroy it
 * instead, so the pool opens a fresh connection to whichever server now answers.
 */
function discardOnTimeout(connection: PooledConnection): void {
  if (guarded.has(connection)) return;
  guarded.add(connection);
  const query = connection.query.bind(connection);
  connection.query = (...args: unknown[]) => {
    const index = args.findIndex((arg) => typeof arg === "function");
    const callback = args[index] as QueryCallback | undefined;
    if (callback) {
      args[index] = (err: { code?: string } | null, ...rest: unknown[]) => {
        if (err?.code === "PROTOCOL_SEQUENCE_TIMEOUT") connection.destroy();
        callback(err, ...rest);
      };
    }
    return query(...args);
  };
}

/** Connects and guards every pooled connection against queries that never answer. */
export async function initializeDataSource(dataSource: DataSource): Promise<DataSource> {
  await dataSource.initialize();
  const pool = (dataSource.driver as unknown as { pool?: NodeJS.EventEmitter }).pool;
  pool?.on("acquire", discardOnTimeout);
  return dataSource;
}
