import { describe, expect, it } from "vitest";
import { API_SELECTOR, container, find, kinds, podSpec, render, type Any } from "./render";

const defaults = render();
const deployment = find(defaults, "Deployment");

describe("availability", () => {
  it("spreads replicas over zones strictly and over nodes softly", () => {
    expect(podSpec(deployment).topologySpreadConstraints).toEqual([
      {
        maxSkew: 1,
        topologyKey: "topology.kubernetes.io/zone",
        whenUnsatisfiable: "DoNotSchedule",
        matchLabelKeys: ["pod-template-hash"],
        labelSelector: { matchLabels: API_SELECTOR },
      },
      {
        maxSkew: 1,
        topologyKey: "kubernetes.io/hostname",
        whenUnsatisfiable: "ScheduleAnyway",
        matchLabelKeys: ["pod-template-hash"],
        labelSelector: { matchLabels: API_SELECTOR },
      },
    ]);
    expect((deployment.spec as Any).selector.matchLabels).toEqual(API_SELECTOR);
    expect((deployment.spec as Any).template.metadata.labels).toMatchObject(API_SELECTOR);
  });

  it("autoscaling on by default: HPA 3-10 at 70% CPU and no fixed replicas", () => {
    const hpa = find(defaults, "HorizontalPodAutoscaler");
    expect(hpa.apiVersion).toBe("autoscaling/v2");
    expect(hpa.spec).toEqual({
      scaleTargetRef: { apiVersion: "apps/v1", kind: "Deployment", name: deployment.metadata.name },
      minReplicas: 3,
      maxReplicas: 10,
      metrics: [
        {
          type: "Resource",
          resource: { name: "cpu", target: { type: "Utilization", averageUtilization: 70 } },
        },
      ],
    });
    expect(deployment.spec).not.toHaveProperty("replicas");
  });

  it("autoscaling off: no HPA and replicas from replicaCount, default 3", () => {
    const off = render({ autoscaling: { enabled: false } });
    expect(kinds(off)).not.toContain("HorizontalPodAutoscaler");
    expect((find(off, "Deployment").spec as Any).replicas).toBe(3);
    const five = render({ autoscaling: { enabled: false }, replicaCount: 5 });
    expect((find(five, "Deployment").spec as Any).replicas).toBe(5);
  });

  it("disruption budget allows one voluntary eviction at a time", () => {
    const pdb = find(defaults, "PodDisruptionBudget");
    expect(pdb.apiVersion).toBe("policy/v1");
    expect(pdb.spec).toEqual({ maxUnavailable: 1, selector: { matchLabels: API_SELECTOR } });
  });

  it("rollout surges before it removes a ready replica", () => {
    expect((deployment.spec as Any).strategy).toEqual({
      type: "RollingUpdate",
      rollingUpdate: { maxUnavailable: 0, maxSurge: "25%" },
    });
  });

  it("probes: startup and liveness on /healthz, readiness on /readyz", () => {
    const api = container(deployment);
    expect(api.ports).toEqual([{ name: "http", containerPort: 3000, protocol: "TCP" }]);
    expect(api.startupProbe).toEqual({
      httpGet: { path: "/healthz", port: "http" },
      periodSeconds: 2,
      failureThreshold: 30,
    });
    expect(api.readinessProbe).toMatchObject({
      httpGet: { path: "/readyz", port: "http" },
      periodSeconds: 5,
      failureThreshold: 2,
    });
    expect(api.livenessProbe).toMatchObject({
      httpGet: { path: "/healthz", port: "http" },
      periodSeconds: 10,
      failureThreshold: 3,
    });
  });

  it("termination: preStop sleep, drain budget and grace period fit together", () => {
    const pod = podSpec(deployment);
    const api = container(deployment);
    const sleep = api.lifecycle.preStop.sleep.seconds as number;
    const configMap = find(defaults, "ConfigMap");
    const drainMs = Number(configMap.data?.SHUTDOWN_TIMEOUT_MS);
    expect(sleep).toBe(5);
    expect(pod.terminationGracePeriodSeconds).toBe(35);
    expect(drainMs).toBe(25000);
    expect(sleep + drainMs / 1000).toBeLessThan(pod.terminationGracePeriodSeconds as number);
  });

  it("resources: requests and a memory limit, no CPU limit", () => {
    expect(container(deployment).resources).toEqual({
      requests: { cpu: "100m", memory: "128Mi" },
      limits: { memory: "256Mi" },
    });
  });
});
