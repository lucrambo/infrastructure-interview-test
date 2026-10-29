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
