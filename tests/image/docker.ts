import { spawnSync } from "node:child_process";

/** The image `scripts/image.sh build` produces, built once by the image global setup. */
export const IMAGE = "posts-api:local";

export interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function docker(args: string[], input?: string): Run {
  const result = spawnSync("docker", args, { encoding: "utf8", input });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Runs `scripts/image.sh` through bash, as a maintainer does. */
export function imageScript(command: string, env: Record<string, string> = {}): Run {
  const result = spawnSync("bash", ["scripts/image.sh", command], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** `docker image inspect` with a `{{json ...}}` format, parsed. */
export function inspect(reference: string, format: string): unknown {
  const result = docker(["image", "inspect", reference, "--format", format]);
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}
