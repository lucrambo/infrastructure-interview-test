import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { docker, IMAGE, inspect } from "./docker";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

describe("image contents", () => {
  it("runs as the non-root user 65532:65532", () => {
    expect(inspect(IMAGE, "{{json .Config.User}}")).toBe("65532:65532");
    const run = docker([
      "run",
      "--rm",
      IMAGE,
      "-e",
      "process.stdout.write(process.getuid() + ':' + process.getgid())",
    ]);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toBe("65532:65532");
  });

  it.each(["/bin/sh", "/bin/bash"])("has no shell: %s fails to start", (shell) => {
    const run = docker(["run", "--rm", "--entrypoint", shell, IMAGE, "-c", "true"]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/no such file or directory|not found/i);
  });

  it("holds production files only", () => {
    const paths = {
      "dist/server.js": true,
      "dist/data-source.js": true,
      "node_modules/typeorm/cli.js": true,
      src: false,
      tests: false,
      ".git": false,
      ".env": false,
      "node_modules/typescript": false,
      "node_modules/vitest": false,
      "node_modules/eslint": false,
    };
    const script = `const fs = require("fs"); process.stdout.write(JSON.stringify(${JSON.stringify(
      Object.keys(paths),
    )}.map((p) => [p, fs.existsSync(p)])))`;
    const run = docker(["run", "--rm", IMAGE, "-e", script]);
    expect(run.status, run.stderr).toBe(0);
    expect(Object.fromEntries(JSON.parse(run.stdout) as [string, boolean][])).toEqual(paths);
  });

  it("labels tie the image to its source, commit and version", () => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    expect(inspect(IMAGE, "{{json .Config.Labels}}")).toMatchObject({
      "org.opencontainers.image.source":
        "https://github.com/lucrambo/infrastructure-interview-test",
      "org.opencontainers.image.revision": head,
      "org.opencontainers.image.version": pkg.version,
      "org.opencontainers.image.licenses": "MIT",
      "org.opencontainers.image.title": "posts-api",
    });
  });

  it("size is at most 100 MB", () => {
    expect(inspect(IMAGE, "{{json .Architecture}}")).toBe("amd64");
    expect(Number(inspect(IMAGE, "{{json .Size}}"))).toBeLessThanOrEqual(100_000_000);
  });

  it("every base image is pinned by digest", () => {
    const froms = readFileSync("Dockerfile", "utf8")
      .split("\n")
      .filter((line) => /^FROM\s/i.test(line));
    expect(froms).toHaveLength(2);
    for (const line of froms) expect(line).toMatch(/^FROM\s+\S+@sha256:[0-9a-f]{64}(\s|$)/);
  });
});
