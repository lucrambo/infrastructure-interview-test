# CI and release checks

Mutations: 3
Build: `yarn typecheck`; `yarn lint`
Plan: `.specs/features/ci-release/plan.md`

10 checks in 3 slices · 2 one-way doors · 1 open, of which 0 block (1 blocks go-live)

C1, C6, C8 and C9 are also observed on GitHub after the final push (plan `Assumptions`).

## Checks

### S1 - Every change is checked

**C1** - The `ci` workflow triggers on `pull_request`, `push` to `main` and `workflow_call`, and its jobs `verify`, `chart`, `image`, `terraform`, `e2e` run the commands of AC 1 (AC 1)
Proof: `yarn vitest run tests/ci/workflows.test.ts -t "ci runs"`

**C2** - Both workflows set top-level `permissions: contents: read`, and only the signing job adds `id-token: write` (AC 2)
Proof: `yarn vitest run tests/ci/workflows.test.ts -t "permissions"`

**C3** - Every external `uses:` names a 40-character commit SHA (AC 3)
Proof: `yarn vitest run tests/ci/workflows.test.ts -t "pinned"`

**C4** - `ci` cancels in-progress runs of the same workflow and ref (AC 4)
Proof: `yarn vitest run tests/ci/workflows.test.ts -t "concurrency"`

**C5** - actionlint reports nothing for `.github/workflows` (AC 5)
Proof: `yarn vitest run tests/ci/workflows.test.ts -t "actionlint"`

### S2 - Releases are deliberate, scanned and signed

**C6** - The `release` workflow triggers on tags `v*` and its publishing job needs the job that calls `ci` (AC 6)
Proof: `yarn vitest run tests/ci/workflows.test.ts -t "release waits for ci"`

**C7** - The tag check accepts `v0.1.0` for version `0.1.0` and rejects `v0.2.0` (AC 7)
Proof: `yarn vitest run tests/ci/workflows.test.ts -t "tag check"`

**C8** - The publishing job logs in with `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`, scans, runs `scripts/image.sh push` and signs the pushed digest with cosign (AC 8)
Proof: `yarn vitest run tests/ci/workflows.test.ts -t "publishes"`

**C9** - The README's `cosign verify` command names the identity and issuer of door 2 (AC 9; the verification itself runs after the first signed release)
Proof: `yarn vitest run tests/ci/workflows.test.ts -t "verify command"`

### S3 - Dependencies stay current

**C10** - Dependabot updates npm, Docker, GitHub Actions and both Terraform directories weekly (AC 10)
Proof: `yarn vitest run tests/ci/workflows.test.ts -t "dependabot"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| ci jobs, AC 1 (5) | `verify` C1 · `chart` C1 · `image` C1 · `terraform` C1 · `e2e` C1 | - |
| triggers (4) | `pull_request` C1 · `push` to `main` C1 · `workflow_call` C1 C6 · tags `v*` C6 | - |
| tag examples, AC 7 (2) | `v0.1.0` C7 · `v0.2.0` C7 | - |
| Dependabot ecosystems (5) | npm C10 · docker C10 · github-actions C10 · terraform local C10 · terraform aws C10 | - |
| one-way doors (2) | CI contract C1 C2 C3 C4 · release contract C2 C6 C8 C9 | - |

## Swept

- validation: C7
- failure modes: C6 (a red `ci` stops the release)
- idempotency: existing - `scripts/image.sh push` refuses an existing version (the container-image check on existing versions)
- authorization: C2, C8 (secrets only in the publishing job)
- concurrency: C4
- data lifecycle: n/a - nothing stored
- dependency failure: C10
- state transitions: n/a - workflows hold no state between runs
- observability: C9 (provenance of the image)

## Handoff

- **Settled mid-build:** none
- **Dispatched:** none
- **Boundary:** none closed yet
- **Abandoned:** none
