# App hardening checks

Mutations: 3
Build: `yarn build`; `yarn typecheck`; `yarn lint`
Plan: `.specs/features/app-hardening/plan.md`

36 checks in 5 slices · 6 one-way doors · 0 open, of which 0 block

## Checks

### S1 - Configuration and boot

**C1** - Configuration comes only from the environment, with defaults `PORT=3000`, `DB_PORT=3306`, `DB_SSL=false`, `DB_POOL_MAX=10`, `LOG_LEVEL=info`, `SHUTDOWN_TIMEOUT_MS=25000`, and `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` required (AC 1)
Proof: `yarn vitest run tests/unit/config.test.ts -t "config"`

**C2** - A missing or invalid variable exits 1 with one JSON line naming each offending variable and never its value: `DB_HOST` unset, `DB_PORT=abc`, `DB_PORT=65536`, `DB_PASSWORD=s3cr3t` absent from the output (AC 2)
Proof: `yarn vitest run tests/integration/boot.test.ts -t "invalid configuration"`

**C3** - An unreachable database at boot exits 1 within 15 seconds and logs the connection error (AC 3)
Proof: `yarn vitest run tests/integration/boot.test.ts -t "unreachable database"`

**C4** - `DB_SSL=true` connects over TLS with certificate verification: the options carry `rejectUnauthorized: true`, and a server without TLS is refused (AC 4)
Proof: `yarn vitest run tests/unit/database.test.ts -t "tls"`
Proof: `yarn vitest run tests/integration/boot.test.ts -t "DB_SSL"`

**C5** - `yarn build` compiles to `dist/`, and the `start` script runs `node dist/server.js` without the TypeScript compiler (AC 5)
Proof: `yarn build`
Proof: `yarn vitest run tests/unit/package.test.ts -t "start script"`

### S2 - Schema owned by migrations

**C6** - `migration:run` on an empty database creates `post`, `category` and `post_categories_category` with the door 1 columns, keys, cascades and index, and records `InitialSchema` (AC 6)
Proof: `yarn vitest run tests/integration/migrations.test.ts -t "creates the schema"`

**C7** - `migration:run` on an up-to-date database applies nothing and exits 0 (AC 7)
Proof: `yarn vitest run tests/integration/migrations.test.ts -t "up to date"`

**C8** - `migration:revert` after `InitialSchema` drops the three tables (AC 8)
Proof: `yarn vitest run tests/integration/migrations.test.ts -t "revert"`

**C9** - Booting against an empty database creates no table and `/readyz` answers 200 (AC 9)
Proof: `yarn vitest run tests/integration/boot.test.ts -t "creates no table"`

### S3 - Posts API contract

**C10** - A valid `POST /posts` answers 201 with `id`, `title`, `text`, `categories` with ids and `Location: /posts/<id>`; without `categories` it answers `"categories": []` (AC 10)
Proof: `yarn vitest run tests/integration/posts.test.ts -t "POST /posts creates"`

**C11** - An invalid `POST /posts` body answers 400 problem+json with one `errors` entry per field and stores nothing, over every example of AC 11: `title` missing, 256 vs 255, `text` empty, 10000 vs 10001, 11 vs 10 categories, `name` of 101, unknown `id` leaves post 1 unchanged, malformed JSON (AC 11)
Proof: `yarn vitest run tests/integration/posts.test.ts -t "POST /posts validation"`

**C12** - A `POST /posts` body over 100 kB answers 413 problem+json (AC 12)
Proof: `yarn vitest run tests/integration/posts.test.ts -t "body over 100 kB"`

**C13** - A `POST /posts` with a non-JSON `Content-Type` answers 415 problem+json (AC 13)
Proof: `yarn vitest run tests/integration/posts.test.ts -t "unsupported media type"`

**C14** - `GET /posts` returns at most `limit` posts after `after`, ascending by id, with categories, and a `Link` next header only when more exist: empty → `[]`; 25 → 1-20 and `after=20`; `after=20` → 21-25 and no `Link`; exactly 20 → no `Link`; `limit=100` → 200 (AC 14)
Proof: `yarn vitest run tests/integration/posts.test.ts -t "GET /posts pagination"`

**C15** - `GET /posts` with `limit=0`, `limit=101`, `limit=abc` or `after=-1` answers 400 problem+json naming the parameter (AC 15)
Proof: `yarn vitest run tests/integration/posts.test.ts -t "GET /posts rejects"`

**C16** - `GET /posts/:id` returns the stored post with its categories, values unchanged from the create (AC 16)
Proof: `yarn vitest run tests/integration/posts.test.ts -t "GET /posts/:id returns"`

**C17** - `GET /posts/:id` for an absent post answers 404 problem+json (AC 17)
Proof: `yarn vitest run tests/integration/posts.test.ts -t "GET /posts/:id absent"`

**C18** - An `id` of `abc`, `0`, `2147483648` or `1.5` answers 400 problem+json and `2147483647` absent answers 404 (AC 18)
Proof: `yarn vitest run tests/integration/posts.test.ts -t "GET /posts/:id rejects"`

**C19** - An unknown route answers 404 problem+json (AC 19)
Proof: `yarn vitest run tests/integration/http.test.ts -t "unknown route"`

**C20** - An unexpected failure answers 500 problem+json `"title": "Internal Server Error"` with no stack, SQL or driver text, and logs the error with the request id (AC 20)
Proof: `yarn vitest run tests/integration/http.test.ts -t "unexpected error"`

**C21** - Every response carries `X-Request-Id`, echoing a valid incoming one and generating a UUID for an absent or invalid one (AC 21)
Proof: `yarn vitest run tests/integration/http.test.ts -t "request id"`

**C22** - No response carries `X-Powered-By` and every response carries `X-Content-Type-Options: nosniff` (AC 22)
Proof: `yarn vitest run tests/integration/http.test.ts -t "security headers"`

### S4 - Operability

**C23** - `GET /healthz` answers 200 `{"status":"ok"}` without the database, including after the database stops (AC 23)
Proof: `yarn vitest run tests/integration/health.test.ts -t "healthz"`

**C24** - `GET /readyz` answers 200 `{"status":"ok"}` when `SELECT 1` succeeds (AC 24)
Proof: `yarn vitest run tests/integration/health.test.ts -t "readyz ready"`

**C25** - `GET /readyz` answers 503 problem+json when the database does not answer within 1 second and while draining (AC 25)
Proof: `yarn vitest run tests/integration/health.test.ts -t "readyz not ready"`

**C26** - On SIGTERM and on SIGINT the process answers `/readyz` 503, refuses new connections, completes the in-flight request with its normal status, closes the pool and exits 0 (AC 26)
Proof: `yarn vitest run tests/integration/lifecycle.test.ts -t "drains"`

**C27** - Draining longer than `SHUTDOWN_TIMEOUT_MS` exits 1 (AC 27)
Proof: `yarn vitest run tests/integration/lifecycle.test.ts -t "shutdown timeout"`

**C28** - The HTTP server uses `keepAliveTimeout` 65000, `headersTimeout` 66000 and `requestTimeout` 30000 (AC 28)
Proof: `yarn vitest run tests/unit/server.test.ts -t "timeouts"`

**C29** - Each request outside `/healthz`, `/readyz`, `/metrics` writes one JSON line with `level`, `time`, `requestId`, `method`, `url`, `statusCode`, `responseTime`, without the body or the `authorization` and `cookie` headers; probe requests write none (AC 29)
Proof: `yarn vitest run tests/integration/observability.test.ts -t "access log"`

**C30** - `GET /metrics` answers Prometheus text with default process metrics and `http_request_duration_seconds` labelled `method`, `route` template and `status_code`; `GET /posts/7` yields `route="/posts/:id"` and no `/posts/7` series (AC 30)
Proof: `yarn vitest run tests/integration/observability.test.ts -t "metrics"`

### S5 - Engineering baseline

**C31** - `yarn typecheck` exits 0 with `strict` enabled (AC 31)
Proof: `yarn typecheck`
Proof: `yarn vitest run tests/unit/package.test.ts -t "strict"`

**C32** - `yarn lint` exits 0 with ESLint, `typescript-eslint` and the Prettier check (AC 32)
Proof: `yarn lint`

**C33** - `yarn test` runs the unit and integration suites against MySQL 8.4 from Testcontainers and exits 0 (AC 33)
Proof: `yarn test`
Proof: `yarn vitest run tests/unit/package.test.ts -t "mysql image"`

**C34** - `yarn npm audit --recursive --environment production --severity high` exits 0 (AC 34)
Proof: `yarn npm audit --recursive --environment production --severity high`

**C35** - Following the `README.md` local development steps from a clean clone, `curl http://localhost:3000/posts` returns `[]` (AC 35)
Proof: `yarn vitest run tests/integration/readme.test.ts -t "readme"`

**C36** - `package.json` declares its own `name`, `"private": true`, `engines.node` `>=24 <25` and no upstream `repository`, `bugs` or `author` (AC 36)
Proof: `yarn vitest run tests/unit/package.test.ts -t "metadata"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| configuration variables, AC 1 (10) | `PORT` C1 · `LOG_LEVEL` C1 · `DB_HOST` C1 · `DB_PORT` C1 · `DB_USER` C1 · `DB_PASSWORD` C1 · `DB_NAME` C1 · `DB_SSL` C1 C4 · `DB_POOL_MAX` C1 · `SHUTDOWN_TIMEOUT_MS` C1 C27 | - |
| invalid configuration, AC 2 (4 examples) | `DB_HOST` unset C2 · `DB_PORT=abc` C2 · `DB_PORT=65536` C2 · secret not printed C2 | - |
| startup config assemblies (3) | `src/server.ts` entry point C2 C3 · `src/data-source.ts` migration CLI entry C6 · test harness `createApp` C10 | - |
| `POST /posts` statuses (5) | 201 C10 · 400 C11 · 413 C12 · 415 C13 · 500 C20 | - |
| `POST /posts` validation, AC 11 (10 examples) | `title` missing C11 · `title` 256 C11 · `title` 255 C11 · `text` empty C11 · `text` 10000 C11 · `text` 10001 C11 · 11 categories C11 · 10 categories C11 · `name` 101 C11 · unknown `id` C11 · malformed JSON C11 | - |
| `GET /posts` statuses (2) | 200 C14 · 400 C15 | - |
| `GET /posts` pagination, AC 14 (5 examples) | empty C14 · 25 posts C14 · `after=20` C14 · exactly 20 C14 · `limit=100` C14 | - |
| `GET /posts` invalid parameters, AC 15 (4) | `limit=0` C15 · `limit=101` C15 · `limit=abc` C15 · `after=-1` C15 | - |
| `GET /posts/:id` statuses (3) | 200 C16 · 400 C18 · 404 C17 C18 | - |
| invalid ids, AC 18 (5) | `abc` C18 · `0` C18 · `2147483648` C18 · `1.5` C18 · `2147483647` C18 | - |
| `GET /healthz` statuses (1) | 200 C23 | - |
| `GET /readyz` statuses (2) | 200 C24 · 503 C25 | - |
| `GET /metrics` statuses (1) | 200 C30 | - |
| shutdown signals (2) | SIGTERM C26 · SIGINT C26 | - |
| server timeouts, AC 28 (3) | `keepAliveTimeout` C28 · `headersTimeout` C28 · `requestTimeout` C28 | - |
| access log fields, AC 29 (10) | `level` C29 · `time` C29 · `requestId` C29 · `method` C29 · `url` C29 · `statusCode` C29 · `responseTime` C29 · body C29 · `authorization` C29 · `cookie` C29 | - |
| one-way doors (6) | schema C6 C8 · error contract C11 C17 C19 C20 · pagination C14 · runtime and toolchain C5 C33 C36 · configuration contract C1 · migrations as a command C6 C9 | - |
| entities (3 tables) | `post` C6 C10 · `category` C6 C10 · `post_categories_category` C6 C16 | - |

## Swept

- validation: C11, C12, C13, C15, C18, C2
- failure modes: C3, C20, C27
- idempotency: n/a - `POST /posts` keeps today's non-idempotent create; an idempotency key is a new capability outside the plan
- authorization: n/a - every route is anonymous by the plan (`Out of scope`: authentication); probe and metrics routes are kept off the public path by the ingress in `helm-chart`
- concurrency: C26 (a request in flight during shutdown), C14 (keyset order is stable under concurrent inserts)
- data lifecycle: C16 (what was created reads back unchanged); deletion n/a - no delete endpoint
- dependency failure: C3, C25, C20
- state transitions: C3, C9, C25, C26, C27
- observability: C21, C29, C30

## Handoff

- **Settled mid-build:** 2026-10-29 - door 4 amended to TypeORM 1.1.x instead of 0.3 (0.3 is tagged `legacy` upstream) - user chose "TypeORM 1.1.x (Recommended)"; 2026-10-29 - database engine is MySQL 8.4 with `mysql2` (AD-001, ADR-001) - user: "quero que você utilize na verdade o mysql, mantendo a tecnologia que já é do projeto"
- **Dispatched:** none
- **Boundary:** none closed yet
- **Abandoned:** none
