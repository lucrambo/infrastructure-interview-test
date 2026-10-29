import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { container, find, render } from "./render";

const production = parse(readFileSync("deploy/production/values.yaml", "utf8"));

describe("production values", () => {
  it("production values require TLS, use the synced secret, rate limit and pin a digest", () => {
    expect(production.database).toMatchObject({ ssl: true, existingSecret: "posts-db" });
    expect(production.rateLimit.enabled).toBe(true);
    expect(production.image.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("production values render a valid release with the RDS host given", () => {
    const values = {
      ...production,
      database: { ...production.database, host: "posts-api.cluster-x.us-east-1.rds.amazonaws.com" },
    };
    const rendered = render(values, { withRequired: false });
    expect(rendered.status, rendered.stderr).toBe(0);
    const api = container(find(rendered, "Deployment"));
    expect(api.image).toBe(`docker.io/lrambo/posts-api@${production.image.digest}`);
    expect(find(rendered, "ConfigMap").data).toMatchObject({ DB_SSL: "true" });
    expect(api.env[0].valueFrom.secretKeyRef.name).toBe("posts-db");

    const kubeconform = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "-i",
        "ghcr.io/yannh/kubeconform:v0.8.0",
        "-strict",
        "-summary",
        "-kubernetes-version",
        "1.34.0",
        "-schema-location",
        "default",
        "-schema-location",
        "https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json",
        "-",
      ],
      { input: rendered.stdout, encoding: "utf8" },
    );
    expect(kubeconform.status, kubeconform.stdout + kubeconform.stderr).toBe(0);
  });
});
