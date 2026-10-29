import { describe, expect, it } from "vitest";
import type { DatabaseConfig } from "../../src/config";
import { dataSourceOptions } from "../../src/database";

const db: DatabaseConfig = {
  host: "db",
  port: 3306,
  user: "app",
  password: "secret",
  name: "posts",
  ssl: false,
  poolMax: 10,
};

describe("database options", () => {
  it("tls is verified when DB_SSL is true", () => {
    const options = dataSourceOptions({ ...db, ssl: true });
    expect(options).toMatchObject({ ssl: { rejectUnauthorized: true } });
  });

  it("tls is off when DB_SSL is false", () => {
    expect(dataSourceOptions(db)).toMatchObject({ ssl: undefined });
  });

  it("never lets the ORM change the schema", () => {
    expect(dataSourceOptions(db)).toMatchObject({ synchronize: false, migrationsRun: false });
  });
});
