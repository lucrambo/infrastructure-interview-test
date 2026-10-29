# Container image checks

Mutations: 3
Build: `yarn build`; `yarn typecheck`; `yarn lint`
Plan: `.specs/features/container-image/plan.md`

16 checks in 2 slices · 4 one-way doors · 0 open, of which 0 block

## Checks

### S1 - A minimal, non-root image

**C1** - The image, given the database variables of a migrated MySQL 8.4, answers `GET /readyz` 200 on port 3000 (AC 1)
Proof: `yarn vitest run tests/image/runtime.test.ts -t "serves"`

**C2** - The image with args `node_modules/typeorm/cli.js migration:run -d dist/data-source.js` creates the schema on an empty database and exits 0 (AC 2)
Proof: `yarn vitest run tests/image/runtime.test.ts -t "migrations"`

**C3** - The image runs as uid 65532 and gid 65532, by its configured user and at runtime (AC 3)
Proof: `yarn vitest run tests/image/contents.test.ts -t "non-root"`

**C4** - `/bin/sh` and `/bin/bash` fail to start in the image (AC 4)
Proof: `yarn vitest run tests/image/contents.test.ts -t "no shell"`

**C5** - With a read-only root filesystem the image still answers `GET /readyz` 200 (AC 5)
Proof: `yarn vitest run tests/image/runtime.test.ts -t "read-only"`

**C6** - The image holds `dist/` and no `src/`, `tests/`, `.git`, `.env`, `typescript`, `vitest` or `eslint` (AC 6)
Proof: `yarn vitest run tests/image/contents.test.ts -t "production files only"`

**C7** - `docker stop` on a serving container exits 0 in under 10 seconds (AC 7)
Proof: `yarn vitest run tests/image/runtime.test.ts -t "docker stop"`

**C8** - The image carries `org.opencontainers.image.source`, `revision` = HEAD, `version` = `package.json` version, `licenses` = `MIT`, `title` = `posts-api` (AC 8)
Proof: `yarn vitest run tests/image/contents.test.ts -t "labels"`

**C9** - The linux/amd64 image is at most 100 MB as `docker image inspect` reports it (AC 9)
Proof: `yarn vitest run tests/image/contents.test.ts -t "size"`

### S2 - Scanned and published

**C10** - `scripts/image.sh scan` on the built image exits 0: no fixable HIGH or CRITICAL in Trivy, no Hadolint warning (AC 10)
Proof: `yarn vitest run tests/image/scripts.test.ts -t "scan passes"`

**C11** - `scripts/image.sh scan` exits 1 on an image with fixable HIGH or CRITICAL vulnerabilities and on a Dockerfile with a Hadolint warning (AC 11)
Proof: `yarn vitest run tests/image/scripts.test.ts -t "scan fails"`

**C12** - `docker.io/lrambo/posts-api` holds `<version>` and `sha-<commit>` resolving to one index with `linux/amd64` and `linux/arm64` manifests and attestation manifests carrying an SBOM and provenance (AC 12)
Proof: `yarn vitest run tests/image/registry.test.ts -t "published index"`

**C13** - `scripts/image.sh push` on a tree with uncommitted changes exits 1 before building (AC 13)
Proof: `yarn vitest run tests/image/scripts.test.ts -t "dirty tree"`

**C14** - `scripts/image.sh push` exits 1 without pushing when tag `<version>` already exists (AC 14)
Proof: `yarn vitest run tests/image/scripts.test.ts -t "existing version"`

**C15** - An anonymous client can fetch the `<version>` manifest of `docker.io/lrambo/posts-api` (AC 15)
Proof: `yarn vitest run tests/image/registry.test.ts -t "anonymous"`

**C16** - Every `FROM` in `Dockerfile` names an image by `@sha256:` digest (AC 16)
Proof: `yarn vitest run tests/image/contents.test.ts -t "digest"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| absent paths, AC 6 (7) | `src/` C6 · `tests/` C6 · `.git` C6 · `.env` C6 · `typescript` C6 · `vitest` C6 · `eslint` C6 | - |
| shells, AC 4 (2) | `/bin/sh` C4 · `/bin/bash` C4 | - |
| OCI labels, AC 8 (5) | `source` C8 · `revision` C8 · `version` C8 · `licenses` C8 · `title` C8 | - |
| platforms, door 4 (2) | `linux/amd64` C12 · `linux/arm64` C12 | - |
| tags, door 1 (2) | `<version>` C12 C14 C15 · `sha-<commit>` C12 | - |
| scan failure causes, AC 11 (2) | Trivy finding C11 · Hadolint warning C11 | - |
| `scripts/image.sh push` refusals (2) | dirty tree C13 · existing version C14 | - |
| container contract, door 3 (5) | server command C1 · migrations args C2 · port 3000 C1 · uid/gid 65532 C3 · nothing written C5 | - |
| base images by digest, door 2 (2) | build stage C16 · runtime stage C16 C3 | - |
| startup assemblies (2) | image entrypoint C1 · migrations entrypoint C2 | - |

## Swept

- validation: C11, C13, C14
- failure modes: C13, C14 (refused before anything is built or pushed)
- idempotency: C14 - a second push of the same version is refused, so a version names one build
- authorization: existing - Docker Hub denies a push without the account's credentials; C15 proves anonymous pulls
- concurrency: n/a - one maintainer pushes a release; two concurrent pushes of a new version both pass the existence check, and the registry keeps the last; CI serialises releases in `ci-release`
- data lifecycle: n/a - the image stores nothing
- dependency failure: C10, C11 (a scanner finding fails the release step)
- state transitions: n/a - no entity changes state
- observability: C8 (labels tie an image to its commit and version); C12 (SBOM and provenance)

## Handoff

- **Settled mid-build:** 2026-10-29 - first publish of `0.1.0` and `sha-186d9b3` authorized - user chose "Sim, publicar agora"
- **Dispatched:** none
- **Boundary:** C1-C16 closed at `186d9b3`; image published as `docker.io/lrambo/posts-api@sha256:70c5e12fe58e2f226ccf03453d06515d2cedc29e1e087a93402dc9572ea04de0`
- **Abandoned:** none - `scripts/image.sh` landed in the Dockerfile commit `6a36bb5` because `git update-index --chmod` had already staged it
