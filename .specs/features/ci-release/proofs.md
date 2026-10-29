# ci-release proofs

**HEAD**: 9481b55
**Tree**: clean
**Result**: 12 pass, 0 fail; mutations 0 killed, 0 not

| Check | Proof | Ran | Passed | Result |
| --- | --- | --- | --- | --- |
| C1 | `yarn vitest run tests/ci/workflows.test.ts -t "ci runs"` | 2 | 2 | pass |
| C2 | `yarn vitest run tests/ci/workflows.test.ts -t "permissions"` | 1 | 1 | pass |
| C3 | `yarn vitest run tests/ci/workflows.test.ts -t "pinned"` | 1 | 1 | pass |
| C4 | `yarn vitest run tests/ci/workflows.test.ts -t "concurrency"` | 1 | 1 | pass |
| C5 | `yarn vitest run tests/ci/workflows.test.ts -t "actionlint"` | 1 | 1 | pass |
| C6 | `yarn vitest run tests/ci/workflows.test.ts -t "release waits for ci"` | 1 | 1 | pass |
| C7 | `yarn vitest run tests/ci/workflows.test.ts -t "tag check"` | 4 | 4 | pass |
| C8 | `yarn vitest run tests/ci/workflows.test.ts -t "publishes"` | 1 | 1 | pass |
| C9 | `yarn vitest run tests/ci/workflows.test.ts -t "verify command"` | 1 | 1 | pass |
| C10 | `yarn vitest run tests/ci/workflows.test.ts -t "dependabot"` | 1 | 1 | pass |
| Build | `yarn typecheck` | - | - | pass |
| Build | `yarn lint` | - | - | pass |
