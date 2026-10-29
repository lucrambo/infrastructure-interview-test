# container-image proofs

**HEAD**: c2ea46d
**Tree**: clean
**Result**: 20 pass, 0 fail; mutations 2 killed, 1 not

| Check | Proof | Ran | Passed | Result |
| --- | --- | --- | --- | --- |
| C1 | `yarn vitest run tests/image/runtime.test.ts -t "serves"` | 2 | 2 | pass |
| C2 | `yarn vitest run tests/image/runtime.test.ts -t "migrations"` | 1 | 1 | pass |
| C3 | `yarn vitest run tests/image/contents.test.ts -t "non-root"` | 1 | 1 | pass |
| C4 | `yarn vitest run tests/image/contents.test.ts -t "no shell"` | 2 | 2 | pass |
| C5 | `yarn vitest run tests/image/runtime.test.ts -t "read-only"` | 1 | 1 | pass |
| C6 | `yarn vitest run tests/image/contents.test.ts -t "production files only"` | 1 | 1 | pass |
| C7 | `yarn vitest run tests/image/runtime.test.ts -t "docker stop"` | 1 | 1 | pass |
| C8 | `yarn vitest run tests/image/contents.test.ts -t "labels"` | 1 | 1 | pass |
| C9 | `yarn vitest run tests/image/contents.test.ts -t "size"` | 1 | 1 | pass |
| C10 | `yarn vitest run tests/image/scripts.test.ts -t "scan passes"` | 1 | 1 | pass |
| C11 | `yarn vitest run tests/image/scripts.test.ts -t "scan fails"` | 2 | 2 | pass |
| C12 | `yarn vitest run tests/image/registry.test.ts -t "published index"` | 1 | 1 | pass |
| C13 | `yarn vitest run tests/image/scripts.test.ts -t "dirty tree"` | 1 | 1 | pass |
| C14 | `yarn vitest run tests/image/scripts.test.ts -t "existing version"` | 1 | 1 | pass |
| C15 | `yarn vitest run tests/image/registry.test.ts -t "anonymous"` | 1 | 1 | pass |
| C16 | `yarn vitest run tests/image/contents.test.ts -t "digest"` | 1 | 1 | pass |
| C17 | `yarn vitest run tests/image/scripts.test.ts -t "push builds"` | 1 | 1 | pass |
| Build | `yarn build` | - | - | pass |
| Build | `yarn typecheck` | - | - | pass |
| Build | `yarn lint` | - | - | pass |

## Mutations

| Mutation | Location | Killed |
| --- | --- | --- |
| push builds linux/amd64 only (arm64 dropped) | `scripts\image.sh:19` | no |
| scan ignores HIGH vulnerabilities | `scripts\image.sh:50` | yes |
| runtime image ships dev dependencies (no production focus) | `Dockerfile:12` | yes |
