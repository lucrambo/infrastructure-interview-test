# Helm chart checks

Mutations: 3
Build: `yarn typecheck`; `yarn lint`; `helm lint --strict deploy/helm/posts-api --set database.host=db --set database.password=x`
Plan: `.specs/features/helm-chart/plan.md`

24 checks in 5 slices · 4 one-way doors · 0 open, of which 0 block

## Checks

### S1 - Highly available across 3 zones

**C1** - The `Deployment` spreads pods with zone `maxSkew: 1` `DoNotSchedule` and hostname `maxSkew: 1` `ScheduleAnyway`, selecting the release's pod labels (AC 1)
Proof: `yarn vitest run tests/chart/availability.test.ts -t "spreads"`

**C2** - With autoscaling on by default, the HPA is `autoscaling/v2` with min 3, max 10 and CPU 70%, and the `Deployment` has no `replicas` (AC 2)
Proof: `yarn vitest run tests/chart/availability.test.ts -t "autoscaling on"`

**C3** - With autoscaling off, no HPA renders and `replicas` is `replicaCount`, default 3 (AC 3)
Proof: `yarn vitest run tests/chart/availability.test.ts -t "autoscaling off"`

**C4** - The `PodDisruptionBudget` has `maxUnavailable: 1` and selects the release's pods (AC 4)
Proof: `yarn vitest run tests/chart/availability.test.ts -t "disruption budget"`

**C5** - The rollout uses `maxUnavailable: 0` and `maxSurge: 25%` (AC 5)
Proof: `yarn vitest run tests/chart/availability.test.ts -t "rollout"`

**C6** - Startup `/healthz` 2 s x 30, readiness `/readyz` 5 s x 2, liveness `/healthz` 10 s x 3, all on port `http` (AC 6)
Proof: `yarn vitest run tests/chart/availability.test.ts -t "probes"`

**C7** - `preStop` sleeps 5 s, grace period 35 s and `SHUTDOWN_TIMEOUT_MS=25000`, and 5 + 25 < 35 (AC 7)
Proof: `yarn vitest run tests/chart/availability.test.ts -t "termination"`

**C8** - Requests `100m` CPU and `128Mi` memory, limit `256Mi` memory and no CPU limit (AC 8)
Proof: `yarn vitest run tests/chart/availability.test.ts -t "resources"`

### S2 - Least privilege

**C9** - Pod and container security contexts match AC 9 on the `Deployment` (AC 9)
Proof: `yarn vitest run tests/chart/security.test.ts -t "security context"`

**C10** - The `Deployment` and the migrations `Job` each run under a chart `ServiceAccount` with `automountServiceAccountToken: false` - the Job under its hook copy (AC 10; amended after Verifier finding 5)
Proof: `yarn vitest run tests/chart/security.test.ts -t "service account"`

**C11** - The `NetworkPolicy` admits ingress on 3000 only from the gateway and monitoring namespaces and egress only to DNS 53 UDP/TCP and the database port (AC 11)
Proof: `yarn vitest run tests/chart/security.test.ts -t "network policy"`

**C12** - `DB_PASSWORD` comes from a `Secret` key, from the chart's own `Secret` or from `database.existingSecret`, and the password text appears nowhere else in the rendered output (AC 12)
Proof: `yarn vitest run tests/chart/security.test.ts -t "password"`

**C13** - `imagePullSecrets` are referenced by the `Deployment` and `Job`; `imageCredentials` renders a `dockerconfigjson` `Secret` that both reference (AC 13)
Proof: `yarn vitest run tests/chart/security.test.ts -t "pull secrets"`

**C14** - The image is `repository:tag` with tag defaulting to `0.1.0`, or `repository@digest` when a digest is set (AC 14)
Proof: `yarn vitest run tests/chart/security.test.ts -t "image reference"`

### S3 - Exposed through a reverse proxy

**C15** - The `Service` is `ClusterIP`, port 80 named `http`, target port `http` (AC 15)
Proof: `yarn vitest run tests/chart/exposure.test.ts -t "service"`

**C16** - The `HTTPRoute` carries the values' `parentRefs` and `hostnames` and only a `PathPrefix /posts` rule to the Service on 80 (AC 16)
Proof: `yarn vitest run tests/chart/exposure.test.ts -t "http route"`

**C17** - With `rateLimit.enabled`, a `BackendTrafficPolicy` targets the `HTTPRoute` with a local limit of 100 per second by default (AC 17)
Proof: `yarn vitest run tests/chart/exposure.test.ts -t "rate limit"`

### S4 - Migrations once per release

**C18** - The migrations `Job` has the door 3 hook annotations, limits and arguments, the Deployment's image and security context, and hook copies of its configuration and secret (AC 18; amended after Verifier finding 5)
Proof: `yarn vitest run tests/chart/migrations.test.ts -t "migrations job"`

### S5 - Correct by construction

**C19** - `helm lint --strict` and kubeconform (Kubernetes 1.34, Gateway API and Envoy Gateway schemas) pass with default values and with every option enabled (AC 19)
Proof: `yarn vitest run tests/chart/validity.test.ts -t "valid manifests"`

**C20** - `helm template` fails naming the field for `replicaCount: 0`, `autoscaling.minReplicas: 1`, an empty `image.repository` and a missing `database.host` (AC 20)
Proof: `yarn vitest run tests/chart/validity.test.ts -t "schema rejects"`

**C21** - `checksum/config` changes when a `ConfigMap` value changes and when the password changes, and not otherwise (AC 21)
Proof: `yarn vitest run tests/chart/validity.test.ts -t "checksum"`

**C22** - The release's `ConfigMap`, `Secret` and `ServiceAccount` are tracked resources (no `helm.sh/hook`), and the Job's copies carry the same data as hooks deleted once every hook succeeded (door 4; appended after Verifier finding 5)
Proof: `yarn vitest run tests/chart/migrations.test.ts -t "hook copies"`

**C23** - The Service, PDB, Deployment and spread selectors match the API pods and not the migrations Job's pods, while the NetworkPolicy covers both (AC 1, AC 4; appended after Verifier finding 4)
Proof: `yarn vitest run tests/chart/migrations.test.ts -t "not selected"`

**C24** - Rendering fails when `maxReplicas < minReplicas` or when `preStopSleepSeconds` plus the drain does not fit the grace period, and accepts one second of margin (AC 7; appended after Verifier finding 6)
Proof: `yarn vitest run tests/chart/validity.test.ts -t "guards"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| spread constraints, door 1 (2) | zone C1 · hostname C1 | - |
| replica sources (2) | HPA C2 · `replicaCount` C3 | - |
| probes, AC 6 (3) | startup C6 · readiness C6 · liveness C6 | - |
| termination timings, AC 7 (3) | `preStop` C7 · grace period C7 · `SHUTDOWN_TIMEOUT_MS` C7 | - |
| security context fields, AC 9 (7) | `runAsNonRoot` C9 · `runAsUser` C9 · `runAsGroup` C9 · `seccompProfile` C9 · `readOnlyRootFilesystem` C9 · `allowPrivilegeEscalation` C9 · capabilities C9 | - |
| network policy peers, AC 11 (4) | gateway ingress C11 · monitoring ingress C11 · DNS egress C11 · database egress C11 | - |
| password sources, AC 12 (2) | `database.password` C12 · `database.existingSecret` C12 | - |
| pull credential sources, AC 13 (2) | `imagePullSecrets` C13 · `imageCredentials` C13 | - |
| image reference forms, AC 14 (2) | tag C14 · digest C14 | - |
| routed paths (4) | `/posts` routed C16 · `/healthz` not C16 · `/readyz` not C16 · `/metrics` not C16 | - |
| schema violations, AC 20 (4) | `replicaCount: 0` C20 · `minReplicas: 1` C20 · empty `image.repository` C20 · missing `database.host` C20 | - |
| rendered kinds (10) | `Deployment` C1 · `HorizontalPodAutoscaler` C2 · `PodDisruptionBudget` C4 · `ServiceAccount` C10 · `NetworkPolicy` C11 · `Secret` C12 C13 · `ConfigMap` C18 · `Service` C15 · `HTTPRoute` C16 · `BackendTrafficPolicy` C17 · `Job` C18 | - |
| one-way doors (4) | placement C1 C2 C4 C5 · Gateway API C16 · migrations hook C18 · configuration contract C12 C21 | - |
| value sets validated, AC 19 (2) | defaults C19 · every option enabled C19 | - |

## Swept

- validation: C20
- failure modes: C18 (`backoffLimit`, `activeDeadlineSeconds`; a failed hook fails the release)
- idempotency: C18 (migrations are idempotent - `app-hardening` C7 - and the hook re-runs on every upgrade)
- authorization: C10, C11, C16 (no API token; only the gateway reaches the pods; only `/posts` is routed)
- concurrency: C18 (one hook Job per release instead of N replicas migrating); C5 (surge before removal)
- data lifecycle: n/a - the chart stores no data
- dependency failure: C6 (readiness drops a replica whose database is unreachable), C7
- state transitions: C7 (Terminating: preStop, drain, kill)
- observability: C11 (scraper admitted to `/metrics`)

## Handoff

- **Settled mid-build:** none from the user; after the Verifier, the configuration objects stopped being hooks and the Job got hook copies (findings 4-6), so C10 and C18 were reworded and C22-C24 appended
- **Dispatched:** Verifier (independent sub-agent, isolated worktree) at `HEAD` after `docs(specs): record helm-chart proofs`, round 1, returned: FAIL, 6 findings
- **Boundary:** C1-C21 closed at `76b0bdc` - `yarn test:chart` 27 tests green
- **Abandoned:** none
