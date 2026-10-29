import { describe, expect, it } from "vitest";
import {
  API_SELECTOR,
  container,
  find,
  MIGRATIONS,
  NAME,
  podSpec,
  render,
  type Any,
} from "./render";

const digest = `sha256:${"b".repeat(64)}`;
const rendered = render({ image: { digest }, imagePullSecrets: [{ name: "regcred" }] });

const HOOK_COPY = {
  "helm.sh/hook": "pre-install,pre-upgrade",
  "helm.sh/hook-weight": "-5",
  "helm.sh/hook-delete-policy": "before-hook-creation,hook-succeeded",
};

function matches(selector: Record<string, string>, labels: Record<string, string>): boolean {
  return Object.entries(selector).every(([key, value]) => labels[key] === value);
}

describe("migrations", () => {
  it("migrations job runs once per release, before the new pods, with the workload settings", () => {
    const job = find(rendered, "Job", MIGRATIONS);
    const deployment = find(rendered, "Deployment");
    expect(job.metadata.annotations).toEqual({
      "helm.sh/hook": "pre-install,pre-upgrade",
      "helm.sh/hook-weight": "0",
      "helm.sh/hook-delete-policy": "before-hook-creation,hook-succeeded",
    });
    expect(job.spec).toMatchObject({ backoffLimit: 2, activeDeadlineSeconds: 300 });

    const pod = podSpec(job);
    expect(pod.restartPolicy).toBe("Never");
    expect(pod.serviceAccountName).toBe(MIGRATIONS);
    expect(pod.securityContext).toEqual(podSpec(deployment).securityContext);
    expect(pod.imagePullSecrets).toEqual([{ name: "regcred" }]);

    const migrate = container(job);
    const api = container(deployment);
    expect(migrate.args).toEqual([
      "node_modules/typeorm/cli.js",
      "migration:run",
      "-d",
      "dist/data-source.js",
    ]);
    expect(migrate.image).toBe(api.image);
    expect(migrate.securityContext).toEqual(api.securityContext);
    expect(migrate.envFrom).toEqual([{ configMapRef: { name: MIGRATIONS } }]);
    expect(migrate.env).toEqual([
      { name: "DB_PASSWORD", valueFrom: { secretKeyRef: { name: MIGRATIONS, key: "password" } } },
    ]);
  });

  it("migrations job gets hook copies holding the same configuration as the release objects", () => {
    expect(find(rendered, "ConfigMap", MIGRATIONS).data).toEqual(find(rendered, "ConfigMap").data);
    expect(find(rendered, "Secret", MIGRATIONS).data).toEqual(find(rendered, "Secret").data);
    for (const kind of ["ServiceAccount", "ConfigMap", "Secret"]) {
      expect(find(rendered, kind, MIGRATIONS).metadata.annotations).toEqual(HOOK_COPY);
      // the release's own objects are tracked resources: kept on rollback, removed on uninstall
      expect(find(rendered, kind, NAME).metadata.annotations ?? {}).not.toHaveProperty(
        "helm.sh/hook",
      );
    }
  });

  it("migrations job pods are not selected as API replicas", () => {
    const jobLabels = (find(rendered, "Job", MIGRATIONS).spec as Any).template.metadata.labels;
    const apiLabels = (find(rendered, "Deployment").spec as Any).template.metadata.labels;
    const selectors: Record<string, string>[] = [
      (find(rendered, "Service").spec as Any).selector,
      (find(rendered, "PodDisruptionBudget").spec as Any).selector.matchLabels,
      (find(rendered, "Deployment").spec as Any).selector.matchLabels,
      ...podSpec(find(rendered, "Deployment")).topologySpreadConstraints.map(
        (c: Any) => c.labelSelector.matchLabels,
      ),
    ];
    for (const selector of selectors) {
      expect(selector).toEqual(API_SELECTOR);
      expect(matches(selector, apiLabels)).toBe(true);
      expect(matches(selector, jobLabels)).toBe(false);
    }
    // the network policy still covers the Job, so it keeps DNS and database egress
    const policy = (find(rendered, "NetworkPolicy").spec as Any).podSelector.matchLabels;
    expect(matches(policy, jobLabels)).toBe(true);
  });
});
