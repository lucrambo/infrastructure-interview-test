# aws-env proofs

**HEAD**: a07ff5c
**Tree**: clean
**Result**: 9 pass, 3 fail; mutations 0 killed, 0 not

| Check | Proof | Ran | Passed | Result |
| --- | --- | --- | --- | --- |
| C1 | `terraform -chdir=deploy/terraform/aws validate` | count unknown | - | pass |
| C1 | `terraform -chdir=deploy/terraform/aws fmt -check -recursive` | count unknown | - | pass |
| C2 | `bash scripts/scan-terraform.sh deploy/terraform/aws` | count unknown | - | pass |
| C3 | `terraform -chdir=deploy/terraform/aws test` | 2 | - | pass |
| C4 | `terraform -chdir=deploy/terraform/aws test -filter=tests/environment.tftest.hcl -verbose` | 0 | - | **no test ran** |
| C5 | `yarn vitest run tests/ci/aws.test.ts -t "node group"` | 1 | 1 | pass |
| C6 | `terraform -chdir=deploy/terraform/aws test -filter=tests/environment.tftest.hcl -verbose` | 0 | - | **no test ran** |
| C7 | `terraform -chdir=deploy/terraform/aws test -filter=tests/environment.tftest.hcl -verbose` | 0 | - | **no test ran** |
| C7 | `yarn vitest run tests/ci/aws.test.ts -t "load balancer"` | 1 | 1 | pass |
| C8 | `yarn vitest run tests/chart/production.test.ts -t "production values"` | 2 | 2 | pass |
| Build | `terraform -chdir=deploy/terraform/aws fmt -check -recursive` | - | - | pass |
| Build | `terraform -chdir=deploy/terraform/aws validate` | - | - | pass |
