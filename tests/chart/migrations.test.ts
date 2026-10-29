import { describe, expect, it } from "vitest";
import { container, find, NAME, podSpec, render, type Any } from "./render";

const digest = `sha256:${"b".repeat(64)}`;
const rendered = render({ image: { digest }, imagePullSecrets: [{ name: "regcred" }] });

describe("migrations", () => {
  it("migrations job runs once per release, before the new pods, with the workload settings", () => {
    const job = find(rendered, "Job", `${NAME}-migrations`);
    const deployment = find(rendered, "Deployment");
    expect(job.metadata.annotations).toEqual({
      "helm.sh/hook": "pre-install,pre-upgrade",
      "helm.sh/hook-weight": "0",
      "helm.sh/hook-delete-policy": "before-hook-creation,hook-succeeded",
    });
    expect(job.spec).toMatchObject({ backoffLimit: 2, activeDeadlineSeconds: 300 });

    const pod = podSpec(job);
    expect(pod.restartPolicy).toBe("Never");
    expect(pod.serviceAccountName).toBe(podSpec(deployment).serviceAccountName);
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
    expect(migrate.envFrom).toEqual(api.envFrom);
    expect(migrate.env).toEqual(api.env);
    expect(migrate.envFrom).toEqual([{ configMapRef: { name: NAME } }]);
  });

  it("configuration objects exist before the job on the first install", () => {
    for (const [kind, name] of [
      ["ServiceAccount", NAME],
      ["ConfigMap", NAME],
      ["Secret", NAME],
    ] as const) {
      const annotations = find(rendered, kind, name).metadata.annotations as Any;
      expect(annotations["helm.sh/hook"]).toBe("pre-install,pre-upgrade");
      expect(Number(annotations["helm.sh/hook-weight"])).toBeLessThan(0);
    }
  });
});
