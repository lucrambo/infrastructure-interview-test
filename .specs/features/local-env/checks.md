# Local environment checks

Mutations: 3
Build: `yarn typecheck`; `yarn lint`; `terraform -chdir=deploy/terraform/local validate`
Plan: `.specs/features/local-env/plan.md`

16 checks in 4 slices · 2 one-way doors · 0 open, of which 0 block

The e2e proofs run against the cluster `scripts/local.sh up && scripts/local.sh deploy` creates.

## Checks

### S1 - A reproducible cluster from Terraform

**C1** - The kind cluster `posts-api` has 1 control-plane and 3 workers labelled `zone-a`, `zone-b`, `zone-c` (AC 1)
Proof: `yarn vitest run tests/e2e/platform.test.ts -t "zoned workers"`

**C2** - The `Gateway` `public` is `Programmed` and answers on `http://localhost:8080`, and `kubectl top nodes` returns metrics for all 4 nodes (AC 2)
Proof: `yarn vitest run tests/e2e/platform.test.ts -t "gateway and metrics"`

**C3** - The `InnoDBCluster` `mysql` is `ONLINE` with 3 members on 3 zones and 2 Router pods on 2 zones, and the `posts` user can use the `posts` database (AC 3)
Proof: `yarn vitest run tests/e2e/platform.test.ts -t "database"`

**C4** - `terraform plan -detailed-exitcode` right after the apply exits 0 (AC 4)
Proof: `yarn vitest run tests/e2e/platform.test.ts -t "no drift"`

**C5** - `terraform fmt -check -recursive` and `terraform validate` pass (AC 5)
Proof: `terraform -chdir=deploy/terraform/local fmt -check -recursive`
Proof: `terraform -chdir=deploy/terraform/local validate`

### S2 - A script from nothing to tested

**C6** - `scripts/local.sh all` runs up, deploy and test and exits 0 when the scenarios pass; an unknown command exits 2 with the usage (AC 6)
Proof: `yarn vitest run tests/e2e/script.test.ts -t "usage"`
Proof: `bash scripts/local.sh all`

**C7** - The running pods use the image built from HEAD, pulled from the private registry through the chart's registry secret, and the release is deployed (AC 7)
Proof: `yarn vitest run tests/e2e/registry.test.ts -t "deployed from the private registry"`

**C8** - A pod pulling the same image without credentials fails as unauthorized (AC 8)
Proof: `yarn vitest run tests/e2e/registry.test.ts -t "without credentials"`

### S3 - Correct through the gateway

**C9** - The k6 functional scenario passes every check through the gateway (AC 9)
Proof: `yarn vitest run tests/e2e/scenarios.test.ts -t "functional"`

**C10** - The k6 load scenario at 30 req/s for 60 s keeps failures under 1% and p95 under 500 ms (AC 10)
Proof: `yarn vitest run tests/e2e/scenarios.test.ts -t "load"`

**C11** - 200 requests within one second get some 429 answers from the gateway (AC 11)
Proof: `yarn vitest run tests/e2e/scenarios.test.ts -t "rate limit"`

### S4 - Available through failures

**C12** - The 3 API pods run on 3 nodes in 3 zones (AC 12)
Proof: `yarn vitest run tests/e2e/availability.test.ts -t "one replica per zone"`

**C13** - A `helm upgrade` that rolls every pod under steady traffic fails no request (AC 13)
Proof: `yarn vitest run tests/e2e/availability.test.ts -t "rolling upgrade"`

**C14** - With the MySQL primary's worker stopped, reads and writes succeed for 30 consecutive seconds within 180 s and earlier posts are still readable (AC 14)
Proof: `yarn vitest run tests/e2e/availability.test.ts -t "zone outage"`

**C15** - A pod outside the gateway namespace times out on an API pod's port 3000 while the gateway route works (AC 15)
Proof: `yarn vitest run tests/e2e/availability.test.ts -t "network policy"`

**C16** - The HPA reports a current CPU utilization (AC 16)
Proof: `yarn vitest run tests/e2e/availability.test.ts -t "autoscaler metrics"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| zones (3) | `zone-a` C1 C12 · `zone-b` C1 C12 · `zone-c` C1 C12 | - |
| platform components (5) | kind C1 · registry C7 C8 · Envoy Gateway C2 · metrics-server C2 C16 · InnoDBCluster C3 | - |
| script commands (5) | `up` C6 · `deploy` C6 C7 · `test` C6 · `down` C6 · `all` C6 | - |
| functional cases, AC 9 (6) | create C9 · read back C9 · pagination C9 · 400 C9 · 404 C9 · probes not routed C9 | - |
| gateway statuses (8) | 200 C9 · 201 C9 · 400 C9 · 404 C9 · 413 C9 · 415 C9 · 429 C11 · probes 404 C9 | - |
| failures survived (4) | rollout C13 · zone with the database primary C14 · unauthorized pull C8 · lateral traffic C15 | - |
| one-way doors (2) | Terraform environment C1 C4 C5 · database topology C3 C14 | - |

## Swept

- validation: C9 (400 and 413 through the gateway)
- failure modes: C14, C13
- idempotency: C4 (a second apply changes nothing); C6 (`up` on an existing cluster is a no-op apply)
- authorization: C8, C15
- concurrency: C10, C13 (writes during the rollout)
- data lifecycle: C14 (acknowledged writes survive a primary loss)
- dependency failure: C14
- state transitions: C13 (pods Terminating while traffic flows), C14 (MySQL primary failover)
- observability: C16

## Handoff

- **Settled mid-build:** none
- **Dispatched:** none
- **Boundary:** none closed yet
- **Abandoned:** none
