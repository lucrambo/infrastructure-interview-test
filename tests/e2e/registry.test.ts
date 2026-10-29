import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { APP, kubectl, kubectlJson, pods, tfOutput, waitFor, type Pod } from "./cluster";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const PROBE = "pull-without-credentials";

afterAll(() => {
  kubectl("delete", "pod", PROBE, "-n", "default", "--ignore-not-found", "--wait=false");
});

describe("private registry", () => {
  it("API is deployed from the private registry with the chart's credentials", () => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const expected = `${tfOutput("registry_pull")}/posts-api:${pkg.version}-${head.slice(0, 7)}`;
    const deployment = kubectlJson<{
      spec: {
        template: {
          spec: { containers: { image: string }[]; imagePullSecrets: { name: string }[] };
        };
      };
      status: { readyReplicas: number };
    }>("get", "deployment", APP, "-n", "posts");
    expect(deployment.spec.template.spec.containers[0]?.image).toBe(expected);
    expect(deployment.spec.template.spec.imagePullSecrets).toEqual([{ name: `${APP}-registry` }]);
    expect(deployment.status.readyReplicas).toBeGreaterThanOrEqual(3);

    const running = pods("posts", "app.kubernetes.io/component=api").filter(
      (p) => !p.metadata.deletionTimestamp,
    );
    for (const pod of running) {
      expect(pod.spec.containers[0]?.image).toBe(expected);
      expect(pod.status.containerStatuses?.[0]?.ready).toBe(true);
    }
  });

  it("a pod pulling the same image without credentials is refused as unauthorized", async () => {
    const image = kubectlJson<{
      spec: { template: { spec: { containers: { image: string }[] } } };
    }>("get", "deployment", APP, "-n", "posts").spec.template.spec.containers[0]?.image;
    const created = kubectl(
      "run",
      PROBE,
      "-n",
      "default",
      "--restart=Never",
      `--image=${image ?? ""}`,
    );
    expect(created.status, created.stderr).toBe(0);

    let reason = "";
    await waitFor(
      "the pull to fail",
      () => {
        const pod = kubectlJson<Pod>("get", "pod", PROBE, "-n", "default");
        const waiting = pod.status.containerStatuses?.[0]?.state.waiting;
        reason = waiting?.reason ?? "";
        return reason === "ErrImagePull" || reason === "ImagePullBackOff";
      },
      120_000,
    );
    expect(["ErrImagePull", "ImagePullBackOff"]).toContain(reason);
    const events = kubectl(
      "get",
      "events",
      "-n",
      "default",
      "--field-selector",
      `involvedObject.name=${PROBE}`,
    );
    expect(events.stdout).toMatch(/401|unauthorized|authorization failed/i);
  });
});
