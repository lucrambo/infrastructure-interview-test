import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { imageScript } from "./docker";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

/** An old release with fixed HIGH and CRITICAL vulnerabilities in its OS packages. */
const VULNERABLE_IMAGE = "node:14.21.3-alpine3.17";

describe("image script", () => {
  it("scan passes on the built image and the Dockerfile", () => {
    const run = imageScript("scan");
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain("== Hadolint: Dockerfile");
    expect(run.stdout).toContain("== Trivy: posts-api:local");
  });

  it("scan fails on an image with fixable HIGH or CRITICAL vulnerabilities", () => {
    const run = imageScript("scan", { IMAGE: VULNERABLE_IMAGE });
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(/(HIGH|CRITICAL): [1-9]/);
    expect(run.stderr).toContain("scan found issues");
  });

  it("scan fails on a Dockerfile with a Hadolint warning", () => {
    const dir = mkdtempSync(join(tmpdir(), "hadolint-"));
    const dockerfile = join(dir, "Dockerfile");
    // DL3008: apt-get install without pinned versions is a warning
    writeFileSync(
      dockerfile,
      "FROM debian:13@sha256:0000000000000000000000000000000000000000000000000000000000000000\n" +
        "RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*\n",
    );
    try {
      const run = imageScript("scan", { DOCKERFILE: dockerfile });
      expect(run.status).toBe(1);
      expect(run.stdout).toContain("DL3008");
      expect(run.stderr).toContain("scan found issues");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("push refuses a dirty tree before building", () => {
    const marker = ".push-dirty-tree-test";
    writeFileSync(marker, "uncommitted\n");
    try {
      const run = imageScript("push");
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("uncommitted changes");
      expect(run.stdout + run.stderr).not.toMatch(/buildx|#\d+ \[/);
    } finally {
      rmSync(marker, { force: true });
    }
  });

  it("push refuses an existing version without pushing", () => {
    const run = imageScript("push");
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`docker.io/lrambo/posts-api:${pkg.version} already exists`);
    expect(run.stdout).not.toContain("pushed");
  });
});
