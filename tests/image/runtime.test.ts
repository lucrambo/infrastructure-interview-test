import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import mysql from "mysql2/promise";
import { Network, type StartedNetwork } from "testcontainers";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MYSQL_IMAGE } from "../mysql";
import { docker, IMAGE } from "./docker";

let network: StartedNetwork;
let db: StartedMySqlContainer;
const containers: string[] = [];

const MIGRATE = ["node_modules/typeorm/cli.js", "migration:run", "-d", "dist/data-source.js"];

beforeAll(async () => {
  network = await new Network().start();
  db = await new MySqlContainer(MYSQL_IMAGE).withNetwork(network).withNetworkAliases("db").start();
  const root = await mysql.createConnection({
    host: db.getHost(),
    port: db.getPort(),
    user: "root",
    password: db.getRootPassword(),
  });
  await root.query("CREATE DATABASE served");
  await root.query("CREATE DATABASE fresh");
  await root.end();
  const migrate = docker([
    "run",
    "--rm",
    "--network",
    network.getName(),
    ...env("served"),
    IMAGE,
    ...MIGRATE,
  ]);
  if (migrate.status !== 0) throw new Error(migrate.stdout + migrate.stderr);
});

afterEach(() => {
  for (const id of containers.splice(0)) docker(["rm", "-f", id]);
});

afterAll(async () => {
  await db.stop();
  await network.stop();
});

function env(database: string): string[] {
  return [
    "-e",
    "DB_HOST=db",
    "-e",
    "DB_USER=root",
    "-e",
    `DB_PASSWORD=${db.getRootPassword()}`,
    "-e",
    `DB_NAME=${database}`,
  ];
}

/** Starts the image detached on the test network and returns its id and published port. */
async function serve(extra: string[] = []): Promise<{ id: string; url: string }> {
  const run = docker([
    "run",
    "-d",
    "--network",
    network.getName(),
    "-p",
    "127.0.0.1::3000",
    ...extra,
    ...env("served"),
    IMAGE,
  ]);
  expect(run.status, run.stderr).toBe(0);
  const id = run.stdout.trim();
  containers.push(id);
  const port = /:(\d+)\s*$/.exec(docker(["port", id, "3000/tcp"]).stdout.split("\n")[0] ?? "")?.[1];
  const url = `http://127.0.0.1:${String(port)}`;
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${url}/readyz`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 30_000, interval: 250 },
    )
    .toBe(200);
  return { id, url };
}

async function tables(database: string): Promise<string[]> {
  const connection = await mysql.createConnection({
    host: db.getHost(),
    port: db.getPort(),
    user: "root",
    password: db.getRootPassword(),
    database,
  });
  const [rows] = await connection.query("SHOW TABLES");
  await connection.end();
  return (rows as Record<string, string>[]).map((row) => Object.values(row)[0] ?? "").sort();
}

describe("image runtime", () => {
  it("serves readiness on port 3000 and the API against a migrated database", async () => {
    const { url } = await serve();
    const ready = await fetch(`${url}/readyz`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ok" });
    const posts = await fetch(`${url}/posts`);
    expect(posts.status).toBe(200);
    expect(await posts.json()).toEqual([]);
  });

  it("runs the migrations with the documented arguments", async () => {
    expect(await tables("fresh")).toEqual([]);
    const run = docker([
      "run",
      "--rm",
      "--network",
      network.getName(),
      ...env("fresh"),
      IMAGE,
      ...MIGRATE,
    ]);
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(await tables("fresh")).toEqual([
      "category",
      "migrations",
      "post",
      "post_categories_category",
    ]);
  });

  it("serves with a read-only root filesystem", async () => {
    const { id, url } = await serve(["--read-only"]);
    expect(
      docker(["inspect", id, "--format", "{{.HostConfig.ReadonlyRootfs}}"]).stdout.trim(),
    ).toBe("true");
    const res = await fetch(`${url}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "read-only", text: "still writes to the database" }),
    });
    expect(res.status).toBe(201);
    expect((await fetch(`${url}/readyz`)).status).toBe(200);
  });

  it("docker stop exits 0 in under 10 seconds", async () => {
    const { id } = await serve();
    const started = Date.now();
    const stop = docker(["stop", "--time", "10", id]);
    const elapsed = Date.now() - started;
    expect(stop.status, stop.stderr).toBe(0);
    expect(elapsed).toBeLessThan(10_000);
    expect(docker(["inspect", id, "--format", "{{.State.ExitCode}}"]).stdout.trim()).toBe("0");
    expect(docker(["logs", id]).stdout).toContain('"msg":"shutdown complete"');
  });
});
