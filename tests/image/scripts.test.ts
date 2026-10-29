import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  credentialFreeConfig,
  docker,
  ensureTestBuilder,
  imageScript,
  snapshot,
  TEST_BUILDER,
} from "./docker";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

/** An old release with fixed HIGH and CRITICAL vulnerabilities in its OS packages. */
const VULNERABLE_IMAGE = "node:14.21.3-alpine3.17";

let registry: StartedTestContainer;
let config: ReturnType<typeof credentialFreeConfig>;

beforeAll(async () => {
  ensureTestBuilder();
  config = credentialFreeConfig();
  registry = await new GenericContainer("registry:3.1.2").withExposedPorts(5000).start();
});

afterAll(async () => {
  config.cleanup();
  await registry.stop();
});

/** A repository on a throwaway local registry, so push tests never touch Docker Hub. */
function localRepo(name: string): string {
  return `localhost:${registry.getMappedPort(5000)}/${name}`;
}

async function tagsOf(name: string): Promise<string[]> {
  const res = await fetch(`http://localhost:${registry.getMappedPort(5000)}/v2/${name}/tags/list`);
  if (res.status === 404) return [];
  return ((await res.json()) as { tags: string[] | null }).tags?.sort() ?? [];
}

function push(repo: string, cwd: string) {
  return imageScript("push", { ...config.env, IMAGE_REPO: repo, BUILDER: TEST_BUILDER }, cwd);
}

function imagetools(args: string[]) {
  return docker(["buildx", "imagetools", "inspect", ...args], undefined, {
    ...process.env,
    ...config.env,
  });
}

describe("image script", () => {
  it("scan passes on the built image and the Dockerfile", () => {
    const run = imageScript("scan");
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain("== Hadolint: Dockerfile");
    expect(run.stdout).toContain("== Trivy: posts-api:local");
  });

  it("scan fails on an image with fixable HIGH and CRITICAL vulnerabilities, counting both", () => {
    const run = imageScript("scan", { IMAGE: VULNERABLE_IMAGE });
    expect(run.status).toBe(1);
    // both severities are scanned: dropping either from the scan removes its count
    expect(run.stdout).toMatch(/HIGH: [1-9]/);
    expect(run.stdout).toMatch(/CRITICAL: [1-9]/);
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

  it("push builds both platforms with attestations and pushes the version and commit tags", async () => {
    const clone = snapshot();
    try {
      const repo = localRepo("posts-api");
      const run = push(repo, clone.dir);
      expect(run.status, run.stdout + run.stderr).toBe(0);

      const commitTag = `sha-${clone.head.slice(0, 7)}`;
      expect(await tagsOf("posts-api")).toEqual([pkg.version, commitTag].sort());

      const raw = imagetools(["--raw", `${repo}:${pkg.version}`]);
      expect(raw.status, raw.stderr).toBe(0);
      const index = JSON.parse(raw.stdout) as {
        manifests: { platform?: { architecture: string }; annotations?: Record<string, string> }[];
      };
      const attestations = index.manifests.filter(
        (m) => m.annotations?.["vnd.docker.reference.type"] === "attestation-manifest",
      );
      const platforms = index.manifests
        .filter((m) => m.annotations?.["vnd.docker.reference.type"] === undefined)
        .map((m) => m.platform?.architecture)
        .sort();
      expect(platforms).toEqual(["amd64", "arm64"]);
      expect(attestations).toHaveLength(2);

      const sameDigest = imagetools(["--raw", `${repo}:${commitTag}`]);
      expect(sameDigest.stdout).toBe(raw.stdout);

      const sbom = imagetools([
        `${repo}:${pkg.version}`,
        "--format",
        '{{ json (index .SBOM "linux/arm64") }}',
      ]);
      expect(sbom.stdout).toContain("SPDX");
      const provenance = imagetools([
        `${repo}:${pkg.version}`,
        "--format",
        '{{ json (index .Provenance "linux/amd64") }}',
      ]);
      expect(provenance.stdout).toContain("buildDefinition");
      const labels = imagetools([
        `${repo}:${pkg.version}`,
        "--format",
        '{{ json (index .Image "linux/amd64").Config.Labels }}',
      ]);
      expect(JSON.parse(labels.stdout)).toMatchObject({
        "org.opencontainers.image.revision": clone.head,
        "org.opencontainers.image.version": pkg.version,
      });
    } finally {
      clone.cleanup();
    }
  });

  it("push refuses a dirty tree before building", async () => {
    const clone = snapshot();
    try {
      writeFileSync(join(clone.dir, "uncommitted.txt"), "uncommitted\n");
      const run = push(localRepo("dirty"), clone.dir);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("uncommitted changes");
      expect(run.stdout + run.stderr).not.toMatch(/#\d+ \[/);
      expect(await tagsOf("dirty")).toEqual([]);
    } finally {
      clone.cleanup();
    }
  });

  it("push refuses an existing version without pushing", async () => {
    const clone = snapshot();
    try {
      const repo = localRepo("existing");
      // seed the version with a tiny image, so the refusal is the only possible outcome
      const seed = mkdtempSync(join(tmpdir(), "seed-"));
      writeFileSync(join(seed, "Dockerfile"), "FROM scratch\nCOPY Dockerfile /seed\n");
      const seeded = docker(
        [
          "buildx",
          "build",
          "--builder",
          TEST_BUILDER,
          "--tag",
          `${repo}:${pkg.version}`,
          "--push",
          seed,
        ],
        undefined,
        { ...process.env, ...config.env },
      );
      rmSync(seed, { recursive: true, force: true });
      expect(seeded.status, seeded.stderr).toBe(0);
      const before = imagetools(["--raw", `${repo}:${pkg.version}`]).stdout;

      const run = push(repo, clone.dir);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(`${repo}:${pkg.version} already exists`);
      expect(run.stdout + run.stderr).not.toMatch(/#\d+ \[/);
      expect(await tagsOf("existing")).toEqual([pkg.version]);
      expect(imagetools(["--raw", `${repo}:${pkg.version}`]).stdout).toBe(before);
    } finally {
      clone.cleanup();
    }
  });
});
