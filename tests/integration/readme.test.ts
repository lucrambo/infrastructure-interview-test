import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { serverEnv } from "../helpers";

/** The commands of the first `bash` block under `## Local development`. */
function localDevelopmentSteps(): string[] {
  const readme = readFileSync("README.md", "utf8");
  const section = readme.split(/^## Local development$/m)[1] ?? "";
  const block = /```bash\n([\s\S]*?)```/.exec(section)?.[1] ?? "";
  return block.split("\n").filter((line) => line.trim() !== "");
}

const clone = mkdtempSync(join(tmpdir(), "posts-readme-"));
let server: ChildProcess | undefined;

function bash(command: string) {
  return spawnSync("bash", ["-c", command], {
    cwd: clone,
    env: serverEnv({}),
    encoding: "utf8",
  });
}

function stopTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  } else {
    process.kill(-child.pid, "SIGTERM");
  }
}

afterAll(() => {
  if (server) stopTree(server);
  bash("docker compose down -v");
  rmSync(clone, { recursive: true, force: true });
});

describe("readme", () => {
  it("local development steps serve an empty post list from a clean clone", async () => {
    execFileSync("git", ["clone", "--quiet", process.cwd(), clone]);
    const steps = localDevelopmentSteps();
    expect(steps.at(-1)).toBe("yarn start");

    for (const step of steps.slice(0, -1)) {
      const result = bash(step);
      expect(result.status, `${step}\n${result.stdout}${result.stderr}`).toBe(0);
    }

    server = spawn("bash", ["-c", "yarn start"], {
      cwd: clone,
      env: serverEnv({}),
      detached: process.platform !== "win32",
    });

    let body: unknown;
    await expect
      .poll(
        async () => {
          try {
            const res = await fetch("http://localhost:3000/posts");
            body = await res.json();
            return res.status;
          } catch {
            return 0;
          }
        },
        { timeout: 60_000, interval: 500 },
      )
      .toBe(200);
    expect(body).toEqual([]);
  }, 600_000);
});
