# helm-chart proofs

**HEAD**: b6525a0
**Tree**: clean
**Result**: 27 pass, 0 fail; mutations 3 killed, 0 not

| Check | Proof | Ran | Passed | Result |
| --- | --- | --- | --- | --- |
| C1 | `yarn vitest run tests/chart/availability.test.ts -t "spreads"` | 1 | 1 | pass |
| C2 | `yarn vitest run tests/chart/availability.test.ts -t "autoscaling on"` | 1 | 1 | pass |
| C3 | `yarn vitest run tests/chart/availability.test.ts -t "autoscaling off"` | 1 | 1 | pass |
| C4 | `yarn vitest run tests/chart/availability.test.ts -t "disruption budget"` | 1 | 1 | pass |
| C5 | `yarn vitest run tests/chart/availability.test.ts -t "rollout"` | 1 | 1 | pass |
| C6 | `yarn vitest run tests/chart/availability.test.ts -t "probes"` | 1 | 1 | pass |
| C7 | `yarn vitest run tests/chart/availability.test.ts -t "termination"` | 1 | 1 | pass |
| C8 | `yarn vitest run tests/chart/availability.test.ts -t "resources"` | 1 | 1 | pass |
| C9 | `yarn vitest run tests/chart/security.test.ts -t "security context"` | 1 | 1 | pass |
| C10 | `yarn vitest run tests/chart/security.test.ts -t "service account"` | 1 | 1 | pass |
| C11 | `yarn vitest run tests/chart/security.test.ts -t "network policy"` | 1 | 1 | pass |
| C12 | `yarn vitest run tests/chart/security.test.ts -t "password"` | 2 | 2 | pass |
| C13 | `yarn vitest run tests/chart/security.test.ts -t "pull secrets"` | 1 | 1 | pass |
| C14 | `yarn vitest run tests/chart/security.test.ts -t "image reference"` | 1 | 1 | pass |
| C15 | `yarn vitest run tests/chart/exposure.test.ts -t "service"` | 2 | 2 | pass |
| C16 | `yarn vitest run tests/chart/exposure.test.ts -t "http route"` | 1 | 1 | pass |
| C17 | `yarn vitest run tests/chart/exposure.test.ts -t "rate limit"` | 1 | 1 | pass |
| C18 | `yarn vitest run tests/chart/migrations.test.ts -t "migrations job"` | 3 | 3 | pass |
| C19 | `yarn vitest run tests/chart/validity.test.ts -t "valid manifests"` | 2 | 2 | pass |
| C20 | `yarn vitest run tests/chart/validity.test.ts -t "schema rejects"` | 5 | 5 | pass |
| C21 | `yarn vitest run tests/chart/validity.test.ts -t "checksum"` | 1 | 1 | pass |
| C22 | `yarn vitest run tests/chart/migrations.test.ts -t "hook copies"` | 1 | 1 | pass |
| C23 | `yarn vitest run tests/chart/migrations.test.ts -t "not selected"` | 1 | 1 | pass |
| C24 | `yarn vitest run tests/chart/validity.test.ts -t "guards"` | 3 | 3 | pass |
| Build | `yarn typecheck` | - | - | pass |
| Build | `yarn lint` | - | - | pass |
| Build | `helm lint --strict deploy/helm/posts-api --set database.host=db --set database.password=x` | - | - | pass |

## Mutations

| Mutation | Location | Killed |
| --- | --- | --- |
| schema accepts autoscaling.minReplicas 2 (zone-redundancy bound shifted by one) | `deploy\helm\posts-api\values.schema.json:47` | yes |
| imageCredentials replaces the listed imagePullSecrets instead of adding to them | `deploy\helm\posts-api\templates\_helpers.tpl:112` | yes |
| rate limit policy renders without its HTTPRoute (dangling targetRef) | `deploy\helm\posts-api\templates\ratelimit.yaml:1` | yes |
