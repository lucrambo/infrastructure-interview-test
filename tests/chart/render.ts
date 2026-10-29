import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAllDocuments } from "yaml";

export const CHART = "deploy/helm/posts-api";
export const RELEASE = "posts";
/** The chart names objects `<release>-posts-api`, unless the release name contains the chart name. */
export const NAME = "posts-posts-api";

/** The two values every install must give: where the database is and how to authenticate. */
export const REQUIRED = { database: { host: "db.example", password: "s3cr3t-pw" } };

export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: { name: string; labels?: Record<string, string>; annotations?: Record<string, string> };
  spec?: Record<string, unknown>;
  data?: Record<string, string>;
  [key: string]: unknown;
}

export interface Rendered {
  status: number | null;
  stdout: string;
  stderr: string;
  objects: K8sObject[];
}

type Values = Record<string, unknown>;

function merge(base: Values, override: Values): Values {
  const out: Values = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    out[key] =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof current === "object" &&
      current !== null &&
      !Array.isArray(current)
        ? merge(current as Values, value as Values)
        : value;
  }
  return out;
}

/** `helm template` with REQUIRED merged under `values`, parsed into objects. */
export function render(values: Values = {}, { withRequired = true } = {}): Rendered {
  const dir = mkdtempSync(join(tmpdir(), "chart-values-"));
  const file = join(dir, "values.json");
  writeFileSync(file, JSON.stringify(withRequired ? merge(REQUIRED, values) : values));
  try {
    const result = spawnSync(
      "helm",
      ["template", RELEASE, CHART, "--namespace", "posts", "-f", file],
      {
        encoding: "utf8",
      },
    );
    const objects =
      result.status === 0
        ? parseAllDocuments(result.stdout)
            .map((doc) => doc.toJS() as K8sObject | null)
            .filter((obj): obj is K8sObject => obj !== null)
        : [];
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, objects };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function find(rendered: Rendered, kind: string, name = NAME): K8sObject {
  const found = rendered.objects.find((o) => o.kind === kind && o.metadata.name === name);
  if (!found)
    throw new Error(
      `no ${kind} ${name} in: ${rendered.objects.map((o) => `${o.kind}/${o.metadata.name}`).join(", ")}`,
    );
  return found;
}

export function kinds(rendered: Rendered): string[] {
  return rendered.objects.map((o) => o.kind).sort();
}

/** Rendered manifests are untyped JSON. */
export type Any = any;

/** The pod spec of a Deployment or a Job. */
export function podSpec(obj: K8sObject): Any {
  return (obj.spec as Any).template.spec;
}

export function container(obj: K8sObject): Any {
  return podSpec(obj).containers[0];
}

/** Every pod of the release, the migrations Job included (the NetworkPolicy selects these). */
export const SELECTOR = {
  "app.kubernetes.io/name": "posts-api",
  "app.kubernetes.io/instance": RELEASE,
};

/** The API pods only: what the Service, PDB, HPA and spread constraints select. */
export const API_SELECTOR = { ...SELECTOR, "app.kubernetes.io/component": "api" };

export const MIGRATIONS = `${NAME}-migrations`;
