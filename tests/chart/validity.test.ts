import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { CHART, find, render, type Any } from "./render";

const KUBECONFORM = "ghcr.io/yannh/kubeconform:v0.8.0";
const CRD_SCHEMAS =
  "https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json";

const EVERYTHING = {
  autoscaling: { enabled: true },
  rateLimit: { enabled: true },
  httpRoute: { hostnames: ["api.example.com"] },
  imagePullSecrets: [{ name: "regcred" }],
  imageCredentials: { registry: "registry.local:5000", username: "ci", password: "pw" },
  podAnnotations: { team: "posts" },
};

function kubeconform(manifests: string) {
  return spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-i",
      KUBECONFORM,
      "-strict",
      "-summary",
      "-kubernetes-version",
      "1.34.0",
      "-schema-location",
      "default",
      "-schema-location",
      CRD_SCHEMAS,
      "-",
    ],
    { input: manifests, encoding: "utf8" },
  );
}

function helmLint(sets: string[]) {
  return spawnSync("helm", ["lint", "--strict", CHART, ...sets.flatMap((s) => ["--set", s])], {
    encoding: "utf8",
  });
}

function checksum(values: Record<string, unknown>): string {
  return (find(render(values), "Deployment").spec as Any).template.metadata.annotations[
    "checksum/config"
  ] as string;
}

describe("validity", () => {
  it.each([
    ["defaults", {}],
    ["every option enabled", EVERYTHING],
  ])("valid manifests: lint and kubeconform pass with %s", (_case, values) => {
    const lint = helmLint(["database.host=db", "database.password=x"]);
    expect(lint.status, lint.stdout + lint.stderr).toBe(0);
    const rendered = render(values);
    expect(rendered.status, rendered.stderr).toBe(0);
    const result = kubeconform(rendered.stdout);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Invalid: 0, Errors: 0, Skipped: 0/);
  });

  it.each([
    ["replicaCount: 0", { replicaCount: 0 }, "replicaCount"],
    ["autoscaling.minReplicas: 1", { autoscaling: { minReplicas: 1 } }, "minReplicas"],
    ["empty image.repository", { image: { repository: "" } }, "repository"],
    ["missing database.host", { database: { host: "" } }, "host"],
  ])("schema rejects %s", (_case, values, field) => {
    const result = render(values);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/values don't meet the specifications of the schema/);
    expect(result.stderr).toContain(field);
  });

  it("checksum changes with the configuration and the password, and only with them", () => {
    const base = checksum({});
    expect(checksum({})).toBe(base);
    expect(checksum({ config: { logLevel: "debug" } })).not.toBe(base);
    expect(checksum({ database: { poolMax: 20 } })).not.toBe(base);
    expect(checksum({ database: { password: "rotated" } })).not.toBe(base);
    expect(checksum({ podAnnotations: { team: "posts" } })).toBe(base);
  });
});
