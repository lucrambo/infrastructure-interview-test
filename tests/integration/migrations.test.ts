import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { DatabaseConfig } from "../../src/config";
import { createTestDatabase, dbEnv, query, serverEnv, tableNames } from "../helpers";

const TABLES = ["category", "migrations", "post", "post_categories_category"];

/** Runs a package script the way an operator does, against `db`. */
function yarn(script: string, db: DatabaseConfig) {
  const result = spawnSync(`yarn ${script}`, {
    env: serverEnv(dbEnv(db)),
    encoding: "utf8",
    shell: true,
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

interface Column {
  table: string;
  column: string;
  type: string;
  nullable: string;
  extra: string;
}

describe("migrations", () => {
  it("migration:run creates the schema on an empty database", async () => {
    const db = await createTestDatabase();
    const run = yarn("migration:run", db);
    expect(run.code, run.output).toBe(0);
    expect(await tableNames(db)).toEqual(TABLES);

    const columns = await query<Column>(
      db,
      `SELECT table_name AS \`table\`, column_name AS \`column\`, column_type AS type,
              is_nullable AS nullable, extra AS \`extra\`
         FROM information_schema.columns
        WHERE table_schema = ? AND table_name <> 'migrations'
        ORDER BY table_name, ordinal_position`,
      [db.name],
    );
    expect(columns).toEqual([
      { table: "category", column: "id", type: "int", nullable: "NO", extra: "auto_increment" },
      { table: "category", column: "name", type: "varchar(100)", nullable: "NO", extra: "" },
      { table: "post", column: "id", type: "int", nullable: "NO", extra: "auto_increment" },
      { table: "post", column: "title", type: "varchar(255)", nullable: "NO", extra: "" },
      { table: "post", column: "text", type: "text", nullable: "NO", extra: "" },
      {
        table: "post_categories_category",
        column: "postId",
        type: "int",
        nullable: "NO",
        extra: "",
      },
      {
        table: "post_categories_category",
        column: "categoryId",
        type: "int",
        nullable: "NO",
        extra: "",
      },
    ]);

    const keys = await query<{ column: string; seq: number }>(
      db,
      `SELECT column_name AS \`column\`, seq_in_index AS seq FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = 'post_categories_category'
          AND index_name = 'PRIMARY' ORDER BY seq_in_index`,
      [db.name],
    );
    expect(keys.map((k) => k.column)).toEqual(["postId", "categoryId"]);

    const indexed = await query<{ column: string }>(
      db,
      `SELECT column_name AS \`column\` FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = 'post_categories_category'
          AND index_name <> 'PRIMARY' AND seq_in_index = 1`,
      [db.name],
    );
    expect(indexed.map((i) => i.column)).toContain("categoryId");

    const foreignKeys = await query<{ column: string; target: string; onDelete: string }>(
      db,
      `SELECT k.column_name AS \`column\`, k.referenced_table_name AS target,
              r.delete_rule AS onDelete
         FROM information_schema.key_column_usage k
         JOIN information_schema.referential_constraints r
           ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name
        WHERE k.table_schema = ? AND k.table_name = 'post_categories_category'
        ORDER BY k.column_name`,
      [db.name],
    );
    expect(foreignKeys).toEqual([
      { column: "categoryId", target: "category", onDelete: "CASCADE" },
      { column: "postId", target: "post", onDelete: "CASCADE" },
    ]);

    const charsets = await query<{ name: string; collation: string }>(
      db,
      `SELECT table_name AS name, table_collation AS collation FROM information_schema.tables
        WHERE table_schema = ? AND table_name <> 'migrations' ORDER BY 1`,
      [db.name],
    );
    for (const table of charsets) expect(table.collation).toMatch(/^utf8mb4_/);

    const applied = await query<{ name: string }>(db, "SELECT name FROM migrations");
    expect(applied).toEqual([{ name: "InitialSchema1761696000000" }]);
  });

  it("migration:run on an up to date database applies nothing and exits 0", async () => {
    const db = await createTestDatabase();
    expect(yarn("migration:run", db).code).toBe(0);
    const again = yarn("migration:run", db);
    expect(again.code, again.output).toBe(0);
    expect(again.output).toMatch(/No migrations are pending/);
    expect(await query(db, "SELECT name FROM migrations")).toHaveLength(1);
  });

  it("migration:revert drops the three tables", async () => {
    const db = await createTestDatabase();
    expect(yarn("migration:run", db).code).toBe(0);
    const revert = yarn("migration:revert", db);
    expect(revert.code, revert.output).toBe(0);
    expect(await tableNames(db)).toEqual(["migrations"]);
    expect(await query(db, "SELECT name FROM migrations")).toEqual([]);
  });
});
