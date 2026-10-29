import { execFileSync } from "node:child_process";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import type { TestProject } from "vitest/node";
import { MYSQL_IMAGE } from "./mysql";

let container: StartedMySqlContainer | undefined;

/** Starts one MySQL server for the whole run and builds `dist/` for the tests that spawn it. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"], {
    stdio: "inherit",
  });
  container = await new MySqlContainer(MYSQL_IMAGE).start();
  project.provide("mysql", {
    host: container.getHost(),
    port: container.getPort(),
    rootPassword: container.getRootPassword(),
  });
  return async () => {
    await container?.stop();
  };
}
