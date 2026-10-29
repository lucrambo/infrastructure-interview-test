import { describe, expect, it } from "vitest";
import { container, find, kinds, MIGRATIONS, NAME, podSpec, render, SELECTOR } from "./render";

const defaults = render();

const POD_SECURITY = {
  runAsNonRoot: true,
  runAsUser: 65532,
  runAsGroup: 65532,
  seccompProfile: { type: "RuntimeDefault" },
};
const CONTAINER_SECURITY = {
  readOnlyRootFilesystem: true,
  allowPrivilegeEscalation: false,
  capabilities: { drop: ["ALL"] },
};

describe("security", () => {
  it("security context is restricted for the pod and the container", () => {
    const deployment = find(defaults, "Deployment");
    expect(podSpec(deployment).securityContext).toEqual(POD_SECURITY);
    expect(container(deployment).securityContext).toEqual(CONTAINER_SECURITY);
  });

  it("service account: the Deployment and the Job each use one with no API token", () => {
    for (const [workload, account] of [
      [find(defaults, "Deployment"), NAME],
      [find(defaults, "Job", MIGRATIONS), MIGRATIONS],
    ] as const) {
      expect(find(defaults, "ServiceAccount", account).automountServiceAccountToken).toBe(false);
      expect(podSpec(workload).serviceAccountName).toBe(account);
      expect(podSpec(workload).automountServiceAccountToken).toBe(false);
    }
  });

  it("network policy admits only the gateway and the scraper, and reaches only DNS and the database", () => {
    const policy = find(render({ database: { port: 3307 } }), "NetworkPolicy");
    expect(policy.spec).toEqual({
      podSelector: { matchLabels: SELECTOR },
      policyTypes: ["Ingress", "Egress"],
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: { "kubernetes.io/metadata.name": "envoy-gateway-system" },
              },
            },
            { namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": "monitoring" } } },
          ],
          ports: [{ port: 3000, protocol: "TCP" }],
        },
      ],
      egress: [
        {
          ports: [
            { port: 53, protocol: "UDP" },
            { port: 53, protocol: "TCP" },
          ],
        },
        { ports: [{ port: 3307, protocol: "TCP" }] },
      ],
    });
  });

  it("network policy also admits the extra egress ports, for Services that remap the database port", () => {
    const policy = find(render({ networkPolicy: { extraEgressPorts: [6446] } }), "NetworkPolicy");
    expect((policy.spec as { egress: unknown[] }).egress[1]).toEqual({
      ports: [
        { port: 3306, protocol: "TCP" },
        { port: 6446, protocol: "TCP" },
      ],
    });
  });

  it("password comes from the chart Secret and appears nowhere else", () => {
    for (const [workload, secretName] of [
      [find(defaults, "Deployment"), NAME],
      [find(defaults, "Job", MIGRATIONS), MIGRATIONS],
    ] as const) {
      const secret = find(defaults, "Secret", secretName);
      expect(Buffer.from(secret.data?.password ?? "", "base64").toString()).toBe("s3cr3t-pw");
      expect(container(workload).env).toEqual([
        { name: "DB_PASSWORD", valueFrom: { secretKeyRef: { name: secretName, key: "password" } } },
      ]);
    }
    expect(defaults.stdout).not.toContain("s3cr3t-pw");
  });

  it("password comes from an existing Secret when one is named", () => {
    const external = render(
      {
        database: { host: "db", password: "", existingSecret: "db-creds", existingSecretKey: "pw" },
      },
      { withRequired: false },
    );
    expect(external.status, external.stderr).toBe(0);
    expect(kinds(external)).not.toContain("Secret");
    for (const workload of [find(external, "Deployment"), find(external, "Job", MIGRATIONS)]) {
      expect(container(workload).env).toEqual([
        { name: "DB_PASSWORD", valueFrom: { secretKeyRef: { name: "db-creds", key: "pw" } } },
      ]);
    }
  });

  it("pull secrets: listed ones and a generated registry Secret are referenced by both workloads", () => {
    const listed = render({ imagePullSecrets: [{ name: "regcred" }] });
    for (const workload of [find(listed, "Deployment"), find(listed, "Job", MIGRATIONS)]) {
      expect(podSpec(workload).imagePullSecrets).toEqual([{ name: "regcred" }]);
    }
    expect(podSpec(find(defaults, "Deployment"))).not.toHaveProperty("imagePullSecrets");

    const generated = render({
      imageCredentials: { registry: "registry.local:5000", username: "ci", password: "reg-pw" },
    });
    for (const [workload, secretName] of [
      [find(generated, "Deployment"), `${NAME}-registry`],
      [find(generated, "Job", MIGRATIONS), `${MIGRATIONS}-registry`],
    ] as const) {
      const registry = find(generated, "Secret", secretName);
      expect(registry.type).toBe("kubernetes.io/dockerconfigjson");
      const config = JSON.parse(
        Buffer.from(registry.data?.[".dockerconfigjson"] ?? "", "base64").toString(),
      );
      expect(config).toEqual({
        auths: {
          "registry.local:5000": {
            username: "ci",
            password: "reg-pw",
            auth: Buffer.from("ci:reg-pw").toString("base64"),
          },
        },
      });
      expect(podSpec(workload).imagePullSecrets).toEqual([{ name: secretName }]);
    }

    // both sources at once: the listed secrets are kept and the generated one is added
    const both = render({
      imagePullSecrets: [{ name: "regcred" }],
      imageCredentials: { registry: "registry.local:5000", username: "ci", password: "reg-pw" },
    });
    expect(podSpec(find(both, "Deployment")).imagePullSecrets).toEqual([
      { name: "regcred" },
      { name: `${NAME}-registry` },
    ]);
    expect(podSpec(find(both, "Job", MIGRATIONS)).imagePullSecrets).toEqual([
      { name: "regcred" },
      { name: `${MIGRATIONS}-registry` },
    ]);
  });

  it("image reference: tag defaults to appVersion, digest wins when set", () => {
    expect(container(find(defaults, "Deployment")).image).toBe("docker.io/lrambo/posts-api:0.1.2");
    const tagged = render({ image: { tag: "0.2.0" } });
    expect(container(find(tagged, "Deployment")).image).toBe("docker.io/lrambo/posts-api:0.2.0");
    const digest = `sha256:${"a".repeat(64)}`;
    const pinned = render({ image: { tag: "0.2.0", digest } });
    for (const workload of [find(pinned, "Deployment"), find(pinned, "Job", MIGRATIONS)]) {
      expect(container(workload).image).toBe(`docker.io/lrambo/posts-api@${digest}`);
    }
  });
});
