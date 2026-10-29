import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** The image `scripts/image.sh build` produces, built once by the image global setup. */
export const IMAGE = "posts-api:local";

/** BuildKit builder the push tests use; host networking reaches a registry on localhost. */
export const TEST_BUILDER = "posts-api-test";

export interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function docker(args: string[], input?: string, env?: NodeJS.ProcessEnv): Run {
  const result = spawnSync("docker", args, { encoding: "utf8", input, env });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Runs `scripts/image.sh` through bash, as a maintainer does, optionally in another checkout. */
export function imageScript(command: string, env: Record<string, string> = {}, cwd?: string): Run {
  const result = spawnSync("bash", ["scripts/image.sh", command], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    cwd,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** `docker image inspect` with a `{{json ...}}` format, parsed. */
export function inspect(reference: string, format: string): unknown {
  const result = docker(["image", "inspect", reference, "--format", format]);
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

export function ensureTestBuilder(): void {
  if (docker(["buildx", "inspect", TEST_BUILDER]).status === 0) return;
  const created = docker([
    "buildx",
    "create",
    "--name",
    TEST_BUILDER,
    "--driver",
    "docker-container",
    "--driver-opt",
    "network=host",
  ]);
  if (created.status !== 0) throw new Error(created.stderr);
}

/**
 * A Docker config with the user's contexts and builders but no registry credentials, so nothing
 * run with it can push to a real registry, whatever the code under test does.
 */
export function credentialFreeConfig(): { env: Record<string, string>; cleanup: () => void } {
  const real = process.env.DOCKER_CONFIG ?? join(homedir(), ".docker");
  const dir = mkdtempSync(join(tmpdir(), "docker-config-"));
  for (const sub of ["buildx", "contexts"]) {
    if (existsSync(join(real, sub))) cpSync(join(real, sub), join(dir, sub), { recursive: true });
  }
  const current = existsSync(join(real, "config.json"))
    ? (JSON.parse(readFileSync(join(real, "config.json"), "utf8")) as { currentContext?: string })
        .currentContext
    : undefined;
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify(current ? { currentContext: current } : {}),
  );
  return {
    env: { DOCKER_CONFIG: dir },
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const SNAPSHOT_FILES = ["Dockerfile", ".dockerignore", "scripts/image.sh", "package.json"];

/**
 * A clean clone of HEAD carrying the working tree's image files, committed: the script sees a
 * clean tree, and a change under test (a mutation) is still what runs.
 */
export function snapshot(): { dir: string; head: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "posts-snapshot-"));
  execFileSync("git", ["clone", "--quiet", process.cwd(), dir]);
  for (const file of SNAPSHOT_FILES) cpSync(file, join(dir, file));
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-C", dir, "-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
      {
        encoding: "utf8",
      },
    ).trim();
  git("add", "-A");
  git("commit", "--quiet", "--allow-empty", "-m", "test snapshot");
  return {
    dir,
    head: git("rev-parse", "HEAD"),
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
