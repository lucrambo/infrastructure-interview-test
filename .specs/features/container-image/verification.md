# Container image verification

**Verdict**: FAIL
**Mutations**: 3 - probed C12, C11, C6
**Proofs**: `proofs.md` at ecaf049 (check_proofs: 19 pass, 0 fail; mutations 1 killed, 2 not)
**Verifier**: independent sub-agent (author != verifier)

## Findings

| Finding | Evidence | Fix | Closed |
| --- | --- | --- | --- |
| `scripts/image.sh push` can drop arm64 (or the SBOM, provenance or either tag) and no test fails: C12 inspects what is already on Docker Hub, so no test runs the push build line | mutation `PLATFORMS="linux/amd64,linux/arm64"` -> `"linux/amd64"` (`scripts/image.sh:19`) not killed by `registry.test.ts -t "published index"` | add a hermetic push test: run `scripts/image.sh push` with `IMAGE_REPO` on a throwaway `registry:2` container (Testcontainers) and an empty `DOCKER_CONFIG`, then assert the index there holds `linux/amd64` and `linux/arm64`, two attestation manifests, an SBOM, provenance and the tags `<version>` and `sha-<HEAD 7>`; keep C12 as the proof of the published 0.1.0 | `6da53fa` - C17 runs `scripts/image.sh push` against a local `registry:3` and asserts amd64, arm64, two attestations, SBOM, provenance, both tags and the revision label |
| C11 does not prove HIGH: the vulnerable test image also has CRITICAL findings, and the assertion `/(HIGH or CRITICAL): [1-9]/`\|CRITICAL): [1-9]/` accepts either, so a scan that ignores HIGH stays green | mutation `--severity HIGH,CRITICAL` -> `--severity CRITICAL` (`scripts/image.sh:50`) not killed by `scripts.test.ts -t "scan fails"` | assert `HIGH: [1-9]` and `CRITICAL: [1-9]` separately on the Trivy summary, or add a case with an image whose only fixable findings are HIGH | `6da53fa` - C11 asserts `HIGH: [1-9]` and `CRITICAL: [1-9]` separately |
| C14 is not hermetic and cannot be mutation-probed: it passes only while Docker Hub already holds `<version>` and the tree is clean. After the release step the README prescribes (bump `version`, commit) the test goes red, and it then runs a full multi-arch build before failing on auth; any untracked file, and every applied mutation, makes it fail on "uncommitted changes" instead, so a mutation of the existence check is killed for the wrong reason | `tests/image/scripts.test.ts:71-76` uses the real `docker.io/lrambo/posts-api` and the real tree; read-only probe: `imagetools inspect docker.io/lrambo/posts-api:9.9.9` with no credentials answers `not found`, so with version 9.9.9 the test would build and attempt a push | run C14 against the same throwaway local registry as the first finding: seed `<version>` there, run push on a committed clean tree (or a temp clone), assert exit 1, "already exists" and that no `sha-` tag was added; this also lets the existence check be mutated | `6da53fa` - C13/C14 run in a committed snapshot clone against a seeded local registry with no credentials; `49f496c` lets the test pick its builder |
| C12 does not tie `sha-<commit>` to the commit that was built: it accepts any one `sha-` tag on the same digest | `registry.test.ts:76-82` checks `^sha-[0-9a-f]{7}$` only | assert the `sha-` tag equals the first 7 characters of the index's `org.opencontainers.image.revision` label (or of the provenance's git commit) | `e6f96d2` - C12 requires the tag `sha-` + the first 7 characters of the published `revision` label on the same digest; `49f496c` makes the tag exactly 7 characters |

## Own examples

- New version tag (other side of the C14 rule): `docker buildx imagetools inspect docker.io/lrambo/posts-api:9.9.9` with an empty `DOCKER_CONFIG` exits 1 with `not found`, so `cmd_push` treats it as new rather than "cannot tell"; a repository that does not exist also answers `not found`. Holds.
- Restricted runtime (Kubernetes `restricted` style, not named by the plan): `--read-only --user 1000770000:0 --cap-drop ALL --security-opt no-new-privileges` against MySQL 8.4 - migrations exit 0, `GET /readyz` 200, `POST /posts` 201, `docker stop` exits 0 in 0.4 s. Holds.
- Hadolint threshold: a Dockerfile with only an info-level rule (DL3059) passes `--failure-threshold warning`. Holds.

## Mutations injected

| Mutation | Location | Killed |
| --- | --- | --- |
| push builds linux/amd64 only (arm64 dropped) | `scripts/image.sh:19` | no |
| scan ignores HIGH vulnerabilities | `scripts/image.sh:50` | no |
| runtime image ships dev dependencies (no production focus) | `Dockerfile:12` | yes |
