# AWS environment checks

Mutations: 3
Build: `terraform -chdir=deploy/terraform/aws fmt -check -recursive`; `terraform -chdir=deploy/terraform/aws validate`
Plan: `.specs/features/aws-env/plan.md`

8 checks in 3 slices · 2 one-way doors · 0 open, of which 0 block

## Checks

### S1 - Valid and secure by construction

**C1** - `terraform init -backend=false`, `validate` and `fmt -check -recursive` pass in `deploy/terraform/aws` (AC 1)
Proof: `terraform -chdir=deploy/terraform/aws validate`
Proof: `terraform -chdir=deploy/terraform/aws fmt -check -recursive`

**C2** - Trivy reports no HIGH or CRITICAL misconfiguration outside `.trivyignore`, every entry of which carries a reason (AC 2)
Proof: `bash scripts/scan-terraform.sh deploy/terraform/aws`

**C3** - `terraform test` applies the configuration against mocked providers and rejects an API endpoint open to `0.0.0.0/0` (AC 3)
Proof: `terraform -chdir=deploy/terraform/aws test`

### S2 - Highly available across 3 zones

**C4** - The mocked apply has 3 private, 3 public and 3 database subnets and 3 NAT gateways (AC 4)
Proof: `terraform -chdir=deploy/terraform/aws test -filter=tests/environment.tftest.hcl -verbose`

**C5** - The node group is `AL2023_ARM_64_STANDARD` on Graviton, spans the private subnets with 3-9 nodes, and EKS secrets use KMS (AC 5)
Proof: `yarn vitest run tests/ci/aws.test.ts -t "node group"`

**C6** - The RDS cluster is MySQL 8.4 Multi-AZ (`db.m6gd.large`, `io2`), encrypted, deletion-protected, 14-day backups, master password managed, TLS required, and MySQL reachable only from the node security group (AC 6)
Proof: `terraform -chdir=deploy/terraform/aws test -filter=tests/environment.tftest.hcl -verbose`

**C7** - The AWS Load Balancer Controller, Envoy Gateway, metrics-server and External Secrets are pinned, and the NLB terminates TLS with `var.certificate_arn` (AC 7)
Proof: `terraform -chdir=deploy/terraform/aws test -filter=tests/environment.tftest.hcl -verbose`
Proof: `yarn vitest run tests/ci/aws.test.ts -t "load balancer"`

### S3 - The chart's production values

**C8** - `deploy/production/values.yaml` sets TLS, the synced secret, the rate limit and a digest, and renders a release kubeconform accepts (AC 8)
Proof: `yarn vitest run tests/chart/production.test.ts -t "production values"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| subnet tiers (3) | private C4 · public C4 · database C4 | - |
| database properties, door 2 (8) | engine 8.4 C6 · Multi-AZ class C6 · `io2` C6 · encrypted C6 · deletion protection C6 · backups C6 · managed master password C6 · TLS C6 | - |
| platform charts (4) | AWS Load Balancer Controller C7 · Envoy Gateway C7 · metrics-server C7 · External Secrets C7 | - |
| accepted findings (2) | AWS-0040 C2 · AWS-0104 C2 | - |
| one-way doors (2) | state and layout C1 · production database C6 | - |

## Swept

- validation: C3 (API CIDRs), C1
- failure modes: C6 (Multi-AZ failover, final snapshot on destroy)
- idempotency: n/a - Terraform plans are idempotent by construction; nothing is applied here
- authorization: C6 (database reachable from nodes only), C2, C3
- concurrency: C1 (S3 native state locking, door 1)
- data lifecycle: C6 (14-day backups, deletion protection, final snapshot)
- dependency failure: C4 (NAT per zone)
- state transitions: n/a - no entity changes state
- observability: C6 (log exports, Performance Insights)

## Handoff

- **Settled mid-build:** none from the user; the proofs of C4, C6, C7 used `terraform test -run`, which does not exist, and now use `-filter` on the same test file
- **Dispatched:** none
- **Boundary:** none closed yet
- **Abandoned:** none
