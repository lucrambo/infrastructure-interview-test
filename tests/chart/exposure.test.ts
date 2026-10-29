import { describe, expect, it } from "vitest";
import { API_SELECTOR, find, kinds, NAME, render } from "./render";

const defaults = render();

describe("exposure", () => {
  it("service is ClusterIP on port 80 to the container port http", () => {
    expect(find(defaults, "Service").spec).toEqual({
      type: "ClusterIP",
      selector: API_SELECTOR,
      ports: [{ name: "http", port: 80, targetPort: "http", protocol: "TCP" }],
    });
  });

  it("http route sends only /posts to the service, attached to the configured gateway", () => {
    const routed = render({
      httpRoute: {
        parentRefs: [{ name: "edge", namespace: "infra", sectionName: "https" }],
        hostnames: ["api.example.com"],
      },
    });
    const route = find(routed, "HTTPRoute");
    expect(route.apiVersion).toBe("gateway.networking.k8s.io/v1");
    expect(route.spec).toEqual({
      parentRefs: [{ name: "edge", namespace: "infra", sectionName: "https" }],
      hostnames: ["api.example.com"],
      rules: [
        {
          matches: [{ path: { type: "PathPrefix", value: "/posts" } }],
          backendRefs: [{ name: NAME, port: 80 }],
        },
      ],
    });
    expect(JSON.stringify(route)).not.toMatch(/healthz|readyz|metrics/);
    expect(find(defaults, "HTTPRoute").spec).toMatchObject({
      parentRefs: [{ name: "public", namespace: "gateway" }],
    });
    expect(kinds(render({ httpRoute: { enabled: false } }))).not.toContain("HTTPRoute");
  });

  it("rate limit is off by default and limits the route at 100 per second when enabled", () => {
    expect(kinds(defaults)).not.toContain("BackendTrafficPolicy");
    const policy = find(render({ rateLimit: { enabled: true } }), "BackendTrafficPolicy");
    expect(policy.apiVersion).toBe("gateway.envoyproxy.io/v1alpha1");
    expect(policy.spec).toEqual({
      targetRefs: [{ group: "gateway.networking.k8s.io", kind: "HTTPRoute", name: NAME }],
      rateLimit: {
        type: "Local",
        local: { rules: [{ limit: { requests: 100, unit: "Second" } }] },
      },
    });
    // without a route there is nothing to attach the policy to
    expect(
      kinds(render({ rateLimit: { enabled: true }, httpRoute: { enabled: false } })),
    ).not.toContain("BackendTrafficPolicy");
    const custom = find(
      render({ rateLimit: { enabled: true, requests: 20, unit: "Minute" } }),
      "BackendTrafficPolicy",
    );
    expect(custom.spec).toMatchObject({
      rateLimit: { local: { rules: [{ limit: { requests: 20, unit: "Minute" } }] } },
    });
  });
});
