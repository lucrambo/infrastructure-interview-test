# ADR-002: Use a distroless Node.js runtime image with immutable, multi-arch tags

- **Date**: 2026-10-29
- **Status**: Accepted
- **Deciders**: project owner, implementation team
- **Tags**: security, release, cost

## Context and Problem Statement

The service ships as a container image on a public registry (Docker Hub, AD-002) and runs 24/7
in Kubernetes. Whatever the runtime image contains is attack surface and patching work: a shell
or package manager in production lets an attacker who gets code execution download and run tools,
and every extra package is another CVE to track. Tags are the reference the cluster deploys, so
their semantics decide whether a rollout or a rollback is reproducible.

## Decision Drivers

- Minimal attack surface: no shell, no package manager, non-root by default
- glibc, the libc Node.js is built and tested against
- A small image, pulled quickly on node scale-out
- The same reference always names the same bytes
- Runs on amd64 and on cheaper arm64 nodes

## Considered Options

- `gcr.io/distroless/nodejs24-debian13:nonroot`, pinned by digest
- `node:24-alpine`
- `node:24-trixie-slim` as the runtime

## Decision Outcome

Chosen option: **distroless `nodejs24-debian13:nonroot`, pinned by digest**, built in two stages
from `node:24-trixie-slim`, published for `linux/amd64` and `linux/arm64` with SBOM and provenance,
under immutable tags `<version>` and `sha-<commit>` and no `latest`.

### Positive Consequences

- No shell or package manager in production; runs as uid 65532 out of the box
- About 63 MB, half of it Node.js itself; Debian security updates arrive through the digest bump
- A version tag names one build forever; rollbacks redeploy the exact bytes that ran before

### Negative Consequences

- No shell for `kubectl exec` debugging; use `kubectl debug` with an ephemeral container instead
- Digests do not update themselves: base image bumps need tooling (Renovate or Dependabot) in CI
- No `latest` tag: every consumer must name a version

## Pros and Cons of the Options

### Distroless nodejs24 ✅ Chosen

- ✅ Smallest surface, glibc, non-root default, multi-arch upstream
- ❌ Debugging needs ephemeral containers

### `node:24-alpine`

- ✅ Small
- ❌ musl libc, a less tested platform for Node.js and native modules
- ❌ Ships `sh` and `apk` in production

### `node:24-trixie-slim` as runtime

- ✅ Familiar, has a shell for debugging
- ❌ Shell, apt and about three times the size, so more CVEs to patch

## Links

- [AD-005 in .specs/STATE.md](../../.specs/STATE.md)
- https://github.com/GoogleContainerTools/distroless
