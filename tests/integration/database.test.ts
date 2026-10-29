import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { createDataSource, initializeDataSource } from "../../src/database";
import { createTestDatabase } from "../helpers";

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = createDataSource({
    ...(await createTestDatabase()),
    queryTimeoutMs: 500,
    poolMax: 1,
  });
  await initializeDataSource(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

describe("database", () => {
  it("query timeout fails a query that never answers and the pool recovers", async () => {
    const started = Date.now();
    await expect(dataSource.query("SELECT SLEEP(5)")).rejects.toThrow(/timeout/i);
    // with a pool of one, a quick answer means the busy connection was replaced, not waited for
    const rows: { ok: number | string }[] = await dataSource.query("SELECT 1 AS ok");
    expect(Number(rows[0]?.ok)).toBe(1);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
