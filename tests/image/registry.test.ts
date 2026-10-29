import { describe, expect, it } from "vitest";
import { docker } from "./docker";

const REPOSITORY = "lrambo/posts-api";

/**
 * The newest version on Docker Hub. The commit that bumps package.json is tested before its
 * release publishes it, so these checks look at what is published, not at package.json.
 */
async function latestPublished(): Promise<string> {
  const res = await fetch(
    `https://hub.docker.com/v2/repositories/${REPOSITORY}/tags?page_size=100`,
  );
  const { results } = (await res.json()) as { results: { name: string }[] };
  const versions = results
    .map((t) => t.name)
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => {
      const [x, y] = [a, b].map((v) => v.split(".").map(Number));
      return (
        (x?.[0] ?? 0) - (y?.[0] ?? 0) ||
        (x?.[1] ?? 0) - (y?.[1] ?? 0) ||
        (x?.[2] ?? 0) - (y?.[2] ?? 0)
      );
    });
  const latest = versions.at(-1);
  if (!latest) throw new Error("no version published");
  return latest;
}

interface Descriptor {
  digest: string;
  platform?: { os: string; architecture: string };
  annotations?: Record<string, string>;
}

/** Talks to Docker Hub with no credentials, as any anonymous client does. */
async function anonymousManifest(reference: string): Promise<Response> {
  const auth = await fetch(
    `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${REPOSITORY}:pull`,
  );
  const { token } = (await auth.json()) as { token: string };
  return fetch(`https://registry-1.docker.io/v2/${REPOSITORY}/manifests/${reference}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.oci.image.index.v1+json",
    },
  });
}

describe("published image", () => {
  it("published index holds amd64, arm64 and their attestations under both tags", async () => {
    const pkg = { version: await latestPublished() };
    const raw = docker([
      "buildx",
      "imagetools",
      "inspect",
      "--raw",
      `docker.io/${REPOSITORY}:${pkg.version}`,
    ]);
    expect(raw.status, raw.stderr).toBe(0);
    const index = JSON.parse(raw.stdout) as { manifests: Descriptor[] };
    const platforms = index.manifests
      .filter((m) => m.platform?.os === "linux")
      .map((m) => m.platform?.architecture)
      .sort();
    expect(platforms).toEqual(["amd64", "arm64"]);
    const attestations = index.manifests.filter(
      (m) => m.annotations?.["vnd.docker.reference.type"] === "attestation-manifest",
    );
    expect(attestations).toHaveLength(2);

    const sbom = docker([
      "buildx",
      "imagetools",
      "inspect",
      `docker.io/${REPOSITORY}:${pkg.version}`,
      "--format",
      '{{ json (index .SBOM "linux/amd64") }}',
    ]);
    expect(sbom.stdout).toContain("SPDX");
    const provenance = docker([
      "buildx",
      "imagetools",
      "inspect",
      `docker.io/${REPOSITORY}:${pkg.version}`,
      "--format",
      '{{ json (index .Provenance "linux/amd64") }}',
    ]);
    expect(provenance.stdout).toContain("lucrambo/infrastructure-interview-test");

    const labels = docker([
      "buildx",
      "imagetools",
      "inspect",
      `docker.io/${REPOSITORY}:${pkg.version}`,
      "--format",
      '{{ json (index .Image "linux/amd64").Config.Labels }}',
    ]);
    const revision = (JSON.parse(labels.stdout) as Record<string, string>)[
      "org.opencontainers.image.revision"
    ];
    expect(revision).toMatch(/^[0-9a-f]{40}$/);

    const tags = (await (
      await fetch(`https://hub.docker.com/v2/repositories/${REPOSITORY}/tags?page_size=100`)
    ).json()) as { results: { name: string; digest: string }[] };
    const version = tags.results.find((t) => t.name === pkg.version);
    const commit = tags.results.find((t) => t.name === `sha-${String(revision).slice(0, 7)}`);
    expect(version).toBeDefined();
    expect(commit?.digest).toBe(version?.digest);
    expect(tags.results.map((t) => t.name)).not.toContain("latest");
  });

  it("anonymous clients can fetch the version manifest", async () => {
    const pkg = { version: await latestPublished() };
    const res = await anonymousManifest(pkg.version);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.oci.image.index.v1+json");
  });
});
