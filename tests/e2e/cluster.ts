import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TF_DIR = "deploy/terraform/local";
export const RELEASE = "posts";
export const APP = "posts-posts-api";

const outputs = new Map<string, string>();

/** A Terraform output of the local environment, read once. */
export function tfOutput(name: string): string {
  let value = outputs.get(name);
  if (value === undefined) {
    value = execFileSync("terraform", [`-chdir=${TF_DIR}`, "output", "-raw", name], {
      encoding: "utf8",
    }).trim();
    outputs.set(name, value);
  }
  return value;
}

export function env(): NodeJS.ProcessEnv {
  return { ...process.env, KUBECONFIG: tfOutput("kubeconfig_path"), MSYS_NO_PATHCONV: "1" };
}

export function gateway(): string {
  return tfOutput("gateway_url");
}

export interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function run(command: string, args: string[], input?: string): Run {
  const result = spawnSync(command, args, { encoding: "utf8", env: env(), input });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function kubectl(...args: string[]): Run {
  return run("kubectl", args);
}

/** `kubectl ... -o json`, parsed. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers name the JSON shape they read
export function kubectlJson<T = unknown>(...args: string[]): T {
  const result = kubectl(...args, "-o", "json");
  if (result.status !== 0) throw new Error(`kubectl ${args.join(" ")}: ${result.stderr}`);
  return JSON.parse(result.stdout) as T;
}

export interface Pod {
  metadata: { name: string; labels: Record<string, string>; deletionTimestamp?: string };
  spec: {
    nodeName: string;
    containers: { image: string }[];
    imagePullSecrets?: { name: string }[];
  };
  status: {
    phase: string;
    podIP?: string;
    containerStatuses?: {
      ready: boolean;
      imageID: string;
      state: Record<string, { reason?: string; message?: string }>;
    }[];
  };
}

export function pods(namespace: string, selector: string): Pod[] {
  return kubectlJson<{ items: Pod[] }>("get", "pods", "-n", namespace, "-l", selector).items;
}

/** Node name -> zone label. */
export function nodeZones(): Map<string, string> {
  const nodes = kubectlJson<{
    items: { metadata: { name: string; labels: Record<string, string> } }[];
  }>("get", "nodes").items;
  return new Map(
    nodes.map((n) => [n.metadata.name, n.metadata.labels["topology.kubernetes.io/zone"] ?? ""]),
  );
}

export interface K6Result {
  status: number | null;
  output: string;
  summary: { metrics: Record<string, { values: Record<string, number> }> };
}

function k6Args(script: string, vars: Record<string, string>, summaryFile: string): string[] {
  return [
    "run",
    "--quiet",
    "--no-color",
    "--summary-export",
    summaryFile,
    "-e",
    `BASE_URL=${gateway()}`,
    ...Object.entries(vars).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    `tests/k6/${script}`,
  ];
}

/**
 * k6's --summary-export writes each metric's values flat (`{"passes": 0, "fails": 3}`); expose
 * them under `values` whatever the version.
 */
function readSummary(file: string): K6Result["summary"] {
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    metrics: Record<string, Record<string, unknown>>;
  };
  const metrics: K6Result["summary"]["metrics"] = {};
  for (const [name, metric] of Object.entries(raw.metrics)) {
    metrics[name] = { values: (metric.values ?? metric) as Record<string, number> };
  }
  return { metrics };
}

/** Runs a k6 scenario to completion. */
export function k6(script: string, vars: Record<string, string> = {}): K6Result {
  const dir = mkdtempSync(join(tmpdir(), "k6-"));
  const file = join(dir, "summary.json");
  try {
    const result = spawnSync("k6", k6Args(script, vars, file), { encoding: "utf8", env: env() });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      summary: readSummary(file),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Starts a k6 scenario in the background; resolves with its result when it ends. */
export function k6Background(script: string, vars: Record<string, string> = {}): Promise<K6Result> {
  const dir = mkdtempSync(join(tmpdir(), "k6-"));
  const file = join(dir, "summary.json");
  const child = spawn("k6", k6Args(script, vars, file), { env: env() });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  return new Promise((resolve) => {
    child.on("exit", (status) => {
      const summary = readSummary(file);
      rmSync(dir, { recursive: true, force: true });
      resolve({ status, output, summary });
    });
  });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch with a timeout; network errors and timeouts read as status 0. */
export async function request(
  path: string,
  init: RequestInit = {},
  timeoutMs = 3000,
): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(`${gateway()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: undefined };
  }
}

export function createPost(title: string) {
  return request("/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, text: "e2e" }),
  });
}

export async function waitFor(
  what: string,
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(2000);
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
}
