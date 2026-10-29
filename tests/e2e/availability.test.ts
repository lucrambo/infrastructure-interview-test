import { describe, expect, it } from "vitest";
import {
  APP,
  createPost,
  k6Background,
  kubectl,
  kubectlJson,
  nodeZones,
  pods,
  request,
  run,
  sleep,
  waitFor,
} from "./cluster";

const API = "app.kubernetes.io/component=api";

function readyApiPods() {
  return pods("posts", API).filter(
    (p) => !p.metadata.deletionTimestamp && p.status.containerStatuses?.[0]?.ready === true,
  );
}

describe("availability", () => {
  it("one replica per zone", () => {
    const zones = nodeZones();
    const running = readyApiPods();
    expect(running).toHaveLength(3);
    expect(new Set(running.map((p) => p.spec.nodeName)).size).toBe(3);
    expect(new Set(running.map((p) => zones.get(p.spec.nodeName))).size).toBe(3);
  });

  it("rolling upgrade under steady traffic fails no request", async () => {
    const before = new Set(readyApiPods().map((p) => p.metadata.name));
    const traffic = k6Background("load.js", { RATE: "10", DURATION: "90s", MAX_FAILED: "0" });
    await sleep(10_000);
    const upgrade = run("helm", [
      "upgrade",
      "posts",
      "deploy/helm/posts-api",
      "-n",
      "posts",
      "--reuse-values",
      "--set-string",
      `podAnnotations.rollout=${Date.now()}`,
      "--wait",
      "--timeout",
      "5m",
    ]);
    expect(upgrade.status, upgrade.stderr).toBe(0);
    const result = await traffic;
    expect(result.status, result.output).toBe(0);
    expect(result.summary.metrics.http_req_failed?.values.passes ?? 0).toBe(0);
    const after = readyApiPods().map((p) => p.metadata.name);
    expect(after).toHaveLength(3);
    for (const name of after) expect(before.has(name)).toBe(false);
  });

  it("network policy blocks pods outside the gateway namespace", async () => {
    const target = readyApiPods()[0]?.status.podIP ?? "";
    const probe = kubectl(
      "run",
      "netpol-probe",
      "-n",
      "default",
      "--rm",
      "-i",
      "--restart=Never",
      "--image=curlimages/curl:8.17.0",
      "--command",
      "--",
      "curl",
      "--silent",
      "--max-time",
      "5",
      `http://${target}:3000/healthz`,
    );
    expect(probe.status).not.toBe(0);
    expect(probe.stdout + probe.stderr).not.toContain('"status":"ok"');
    expect((await request("/posts?limit=1")).status).toBe(200);
  });

  it("autoscaler metrics report a current CPU utilization", async () => {
    await waitFor(
      "the HPA to read CPU",
      () => {
        const hpa = kubectlJson<{
          status: {
            currentMetrics?: { resource?: { current?: { averageUtilization?: number } } }[];
          };
        }>("get", "hpa", APP, "-n", "posts");
        return (
          typeof hpa.status.currentMetrics?.[0]?.resource?.current?.averageUtilization === "number"
        );
      },
      180_000,
    );
  });

  it("zone outage: losing the database primary's worker keeps the API serving and the data", async () => {
    const zones = nodeZones();
    const primary = pods("database", "mysql.oracle.com/cluster-role=PRIMARY")[0];
    expect(primary).toBeDefined();
    const node = primary?.spec.nodeName ?? "";
    expect(zones.get(node)).toMatch(/^zone-/);

    const before: { id: number; title: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const created = await createPost(`before outage ${i}`);
      expect(created.status).toBe(201);
      before.push(created.body as { id: number; title: string });
    }

    expect(run("docker", ["stop", node]).status).toBe(0);
    try {
      const started = Date.now();
      let consecutive = 0;
      let lastSecond = 0;
      while (Date.now() - started < 180_000 && consecutive < 30) {
        const read = await request("/posts?limit=1");
        const write = await createPost(`during outage ${Date.now()}`);
        if (read.status === 200 && write.status === 201) {
          const now = Math.floor((Date.now() - started) / 1000);
          if (now !== lastSecond) consecutive += 1;
          lastSecond = now;
        } else {
          consecutive = 0;
        }
        await sleep(250);
      }
      expect(consecutive).toBeGreaterThanOrEqual(30);
      for (const post of before) {
        const read = await request(`/posts/${post.id}`);
        expect(read.status).toBe(200);
        expect((read.body as { title: string }).title).toBe(post.title);
      }
    } finally {
      run("docker", ["start", node]);
      await waitFor(
        "the node and the database to recover",
        () => {
          const ready =
            kubectlJson<{ status: { conditions: { type: string; status: string }[] } }>(
              "get",
              "node",
              node,
            ).status.conditions.find((c) => c.type === "Ready")?.status === "True";
          const cluster = kubectlJson<{ status: { cluster: { onlineInstances: number } } }>(
            "get",
            "innodbcluster",
            "mysql",
            "-n",
            "database",
          );
          return (
            ready && cluster.status.cluster.onlineInstances === 3 && readyApiPods().length === 3
          );
        },
        600_000,
      );
    }
  });
});
