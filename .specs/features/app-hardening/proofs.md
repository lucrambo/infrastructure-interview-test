# app-hardening proofs

**HEAD**: 77291c1
**Tree**: clean
**Result**: 43 pass, 0 fail; mutations 3 killed, 0 not

| Check | Proof | Ran | Passed | Result |
| --- | --- | --- | --- | --- |
| C1 | `yarn vitest run tests/unit/config.test.ts -t "config"` | 23 | 23 | pass |
| C2 | `yarn vitest run tests/integration/boot.test.ts -t "invalid configuration"` | 4 | 4 | pass |
| C3 | `yarn vitest run tests/integration/boot.test.ts -t "unreachable database"` | 2 | 2 | pass |
| C4 | `yarn vitest run tests/unit/database.test.ts -t "tls"` | 2 | 2 | pass |
| C4 | `yarn vitest run tests/integration/boot.test.ts -t "DB_SSL"` | 2 | 2 | pass |
| C5 | `yarn build` | count unknown | - | pass |
| C5 | `yarn vitest run tests/unit/package.test.ts -t "start script"` | 1 | 1 | pass |
| C6 | `yarn vitest run tests/integration/migrations.test.ts -t "creates the schema"` | 1 | 1 | pass |
| C7 | `yarn vitest run tests/integration/migrations.test.ts -t "up to date"` | 1 | 1 | pass |
| C8 | `yarn vitest run tests/integration/migrations.test.ts -t "revert"` | 1 | 1 | pass |
| C9 | `yarn vitest run tests/integration/boot.test.ts -t "creates no table"` | 1 | 1 | pass |
| C10 | `yarn vitest run tests/integration/posts.test.ts -t "POST /posts creates"` | 2 | 2 | pass |
| C11 | `yarn vitest run tests/integration/posts.test.ts -t "POST /posts validation"` | 14 | 14 | pass |
| C12 | `yarn vitest run tests/integration/posts.test.ts -t "body over 100 kB"` | 1 | 1 | pass |
| C13 | `yarn vitest run tests/integration/posts.test.ts -t "unsupported media type"` | 1 | 1 | pass |
| C14 | `yarn vitest run tests/integration/posts.test.ts -t "GET /posts pagination"` | 7 | 7 | pass |
| C15 | `yarn vitest run tests/integration/posts.test.ts -t "GET /posts rejects"` | 8 | 8 | pass |
| C16 | `yarn vitest run tests/integration/posts.test.ts -t "GET /posts/:id returns"` | 1 | 1 | pass |
| C17 | `yarn vitest run tests/integration/posts.test.ts -t "GET /posts/:id absent"` | 1 | 1 | pass |
| C18 | `yarn vitest run tests/integration/posts.test.ts -t "GET /posts/:id rejects"` | 7 | 7 | pass |
| C19 | `yarn vitest run tests/integration/http.test.ts -t "unknown route"` | 1 | 1 | pass |
| C20 | `yarn vitest run tests/integration/http.test.ts -t "unexpected error"` | 1 | 1 | pass |
| C21 | `yarn vitest run tests/integration/http.test.ts -t "request id"` | 6 | 6 | pass |
| C22 | `yarn vitest run tests/integration/http.test.ts -t "security headers"` | 1 | 1 | pass |
| C23 | `yarn vitest run tests/integration/health.test.ts -t "healthz"` | 2 | 2 | pass |
| C24 | `yarn vitest run tests/integration/health.test.ts -t "readyz ready"` | 1 | 1 | pass |
| C25 | `yarn vitest run tests/integration/health.test.ts -t "readyz not ready"` | 3 | 3 | pass |
| C26 | `yarn vitest run tests/integration/lifecycle.test.ts -t "drains"` | 4 | 4 | pass |
| C27 | `yarn vitest run tests/integration/lifecycle.test.ts -t "shutdown timeout"` | 1 | 1 | pass |
| C28 | `yarn vitest run tests/unit/server.test.ts -t "timeouts"` | 1 | 1 | pass |
| C29 | `yarn vitest run tests/integration/observability.test.ts -t "access log"` | 3 | 3 | pass |
| C30 | `yarn vitest run tests/integration/observability.test.ts -t "metrics"` | 2 | 2 | pass |
| C31 | `yarn typecheck` | count unknown | - | pass |
| C31 | `yarn vitest run tests/unit/package.test.ts -t "strict"` | 1 | 1 | pass |
| C32 | `yarn lint` | count unknown | - | pass |
| C33 | `yarn test` | 12 | - | pass |
| C33 | `yarn vitest run tests/unit/package.test.ts -t "mysql image"` | 1 | 1 | pass |
| C34 | `yarn npm audit --recursive --environment production --severity high` | count unknown | - | pass |
| C35 | `yarn vitest run tests/integration/readme.test.ts -t "readme"` | 1 | 1 | pass |
| C36 | `yarn vitest run tests/unit/package.test.ts -t "metadata"` | 1 | 1 | pass |
| Build | `yarn build` | - | - | pass |
| Build | `yarn typecheck` | - | - | pass |
| Build | `yarn lint` | - | - | pass |

## Mutations

| Mutation | Location | Killed |
| --- | --- | --- |
| readiness timeout 1000 ms -> 1900 ms | `src\app.ts:10` | yes |
| keyset cursor id > after -> id >= after | `src\controller\PostGetAllAction.ts:20` | yes |
| second shutdown signal while draining is no longer ignored | `src\server.ts:72` | yes |
