import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}
interface Job {
  needs?: string | string[];
  uses?: string;
  permissions?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, Job>;
}

const DIR = ".github/workflows";
const load = (file: string) => parse(readFileSync(join(DIR, file), "utf8")) as Workflow;
const ci = load("ci.yml");
const release = load("release.yml");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

function runs(job: Job | undefined): string[] {
  return (job?.steps ?? []).flatMap((s) => (s.run ? [s.run.trim()] : []));
}

function needs(job: Job | undefined): string[] {
  const value = job?.needs ?? [];
  return Array.isArray(value) ? value : [value];
}

describe("workflows", () => {
  it("ci runs on pull requests, pushes to main and calls, with every check", () => {
    expect(Object.keys(ci.on).sort()).toEqual(["pull_request", "push", "workflow_call"]);
    expect(ci.on.push).toEqual({ branches: ["main"] });
    expect(Object.keys(ci.jobs).sort()).toEqual(["chart", "e2e", "image", "terraform", "verify"]);
    expect(runs(ci.jobs.verify)).toEqual(
      expect.arrayContaining([
        "yarn lint",
        "yarn typecheck",
        "yarn build",
        "yarn test",
        "yarn npm audit --recursive --environment production --severity high",
      ]),
    );
    expect(runs(ci.jobs.chart)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^helm lint --strict deploy\/helm\/posts-api/),
        "yarn test:chart",
      ]),
    );
    expect(runs(ci.jobs.image)).toEqual(
      expect.arrayContaining([
        "scripts/image.sh build",
        "scripts/image.sh scan",
        "yarn test:image",
      ]),
    );
    const terraform = runs(ci.jobs.terraform).join("\n");
    expect(terraform).toContain("terraform fmt -check -recursive deploy/terraform");
    expect(terraform).toMatch(/for dir in deploy\/terraform\/\*\/[\s\S]*validate/);
    expect(runs(ci.jobs.e2e)).toContain("scripts/local.sh all");
  });

  it("permissions are read-only except the signing job's OIDC token", () => {
    for (const workflow of [ci, release]) {
      expect(workflow.permissions).toEqual({ contents: "read" });
    }
    const elevated = [ci, release].flatMap((w) =>
      Object.entries(w.jobs).filter(([, job]) => job.permissions !== undefined),
    );
    expect(elevated.map(([name, job]) => [name, job.permissions])).toEqual([
      ["publish", { contents: "read", "id-token": "write" }],
    ]);
  });

  it("external actions are pinned to commit SHAs", () => {
    const uses = readdirSync(DIR)
      .flatMap((file) => Object.values(load(file).jobs))
      .flatMap((job) => (job.steps ?? []).flatMap((s) => (s.uses ? [s.uses] : [])));
    expect(uses.length).toBeGreaterThanOrEqual(10);
    for (const ref of uses) {
      if (ref.startsWith("./")) continue;
      expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
  });

  it("concurrency cancels superseded ci runs of the same ref", () => {
    expect(ci.concurrency).toEqual({
      group: "ci-${{ github.workflow }}-${{ github.ref }}",
      "cancel-in-progress": true,
    });
  });

  it("actionlint reports no problem", () => {
    const result = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${process.cwd()}:/repo`,
        "-w",
        "/repo",
        "rhysd/actionlint:1.7.12",
        "-color=false",
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it("release waits for ci and runs only on v tags", () => {
    expect(release.on).toEqual({ push: { tags: ["v*"] } });
    expect(release.jobs.ci?.uses).toBe("./.github/workflows/ci.yml");
    expect(needs(release.jobs.ci)).toEqual(["tag"]);
    expect(needs(release.jobs.publish).sort()).toEqual(["ci", "tag"]);
    expect(runs(release.jobs.tag)).toEqual(['scripts/check-release-tag.sh "$GITHUB_REF_NAME"']);
  });

  it.each([
    [`v${pkg.version}`, 0],
    ["v0.2.0", 1],
    [pkg.version, 1],
    [`v${pkg.version}-rc.1`, 1],
  ])("tag check: %s exits %i", (tag, status) => {
    const result = spawnSync("bash", ["scripts/check-release-tag.sh", tag], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(status);
  });

  it("publishes with the Docker Hub secrets, scans, pushes and signs the digest", () => {
    const steps = release.jobs.publish?.steps ?? [];
    const login = steps.find((s) => s.uses?.startsWith("docker/login-action@"));
    expect(login?.with).toEqual({
      username: "${{ secrets.DOCKERHUB_USERNAME }}",
      password: "${{ secrets.DOCKERHUB_TOKEN }}",
    });
    expect(steps.some((s) => s.uses?.startsWith("sigstore/cosign-installer@"))).toBe(true);
    const commands = runs(release.jobs.publish);
    const order = ["scripts/image.sh scan", "scripts/image.sh push"].map((c) =>
      commands.indexOf(c),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1] ?? -1);
    const sign = commands.at(-1) ?? "";
    expect(sign).toContain("imagetools inspect");
    expect(sign).toContain('cosign sign --yes "$IMAGE_REPO@$digest"');
    // no other job sees the secrets
    for (const [name, job] of Object.entries(release.jobs)) {
      if (name !== "publish") expect(JSON.stringify(job)).not.toContain("secrets.");
    }
  });

  it("verify command in the README names the release workflow identity and the GitHub issuer", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain(
      "--certificate-identity-regexp '^https://github.com/lucrambo/infrastructure-interview-test/.github/workflows/release.yml@refs/tags/v'",
    );
    expect(readme).toContain(
      "--certificate-oidc-issuer https://token.actions.githubusercontent.com",
    );
  });

  it("dependabot updates every dependency source weekly", () => {
    const config = parse(readFileSync(".github/dependabot.yml", "utf8")) as {
      updates: {
        "package-ecosystem": string;
        directory?: string;
        directories?: string[];
        schedule: { interval: string };
      }[];
    };
    const sources = config.updates.flatMap((u) =>
      (u.directories ?? [u.directory ?? ""]).map((d) => `${u["package-ecosystem"]}:${d}`),
    );
    expect(sources.sort()).toEqual([
      "docker:/",
      "github-actions:/",
      "npm:/",
      "terraform:/deploy/terraform/aws",
      "terraform:/deploy/terraform/local",
    ]);
    for (const update of config.updates) expect(update.schedule.interval).toBe("weekly");
  });
});
