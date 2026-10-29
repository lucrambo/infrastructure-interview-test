# Posts API

HTTP API for posts and their categories, written in TypeScript (Express 5, TypeORM) on MySQL 8.4.
It is built to run as several stateless replicas behind a load balancer: configuration comes from
the environment, the schema is owned by versioned migrations, and every replica exposes liveness,
readiness and Prometheus metrics.

The original exercise statement is kept in [docs/challenge.md](docs/challenge.md). Design
decisions are logged in [.specs/STATE.md](.specs/STATE.md), with the important ones as ADRs in
[docs/adr/](docs/adr/).

## Requirements

- Node.js 24 LTS (Yarn 4 is pinned in `package.json` and provided by Corepack)
- Docker, for the local database and the integration tests

## Local development

```bash
corepack enable
yarn install --immutable
cp .env.example .env
docker compose up -d --wait db
yarn build
yarn migration:run
yarn start
```

Then `curl http://localhost:3000/posts` returns `[]`. Stop the database with
`docker compose down` (add `-v` to delete its data).

| Command                                        | What it does                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `yarn build`                                   | compiles `src/` to `dist/`                                                   |
| `yarn start`                                   | runs `dist/server.js`; reads `.env` when the file exists                     |
| `yarn migration:run` / `yarn migration:revert` | applies pending migrations / reverts the last one                            |
| `yarn test`                                    | unit and integration tests; starts a MySQL 8.4 container with Testcontainers |
| `yarn lint` / `yarn format`                    | ESLint and the Prettier check / rewrites formatting                          |
| `yarn typecheck`                               | TypeScript in `strict` mode, tests included                                  |

## Configuration

Every setting is an environment variable; an empty value counts as unset. The process exits with
code 1, naming the offending variables (never their values), when one is missing or invalid.

| Variable              | Default  | Meaning                                                        |
| --------------------- | -------- | -------------------------------------------------------------- |
| `PORT`                | `3000`   | HTTP port                                                      |
| `LOG_LEVEL`           | `info`   | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
| `SHUTDOWN_TIMEOUT_MS` | `25000`  | longest drain after SIGTERM before exiting with code 1         |
| `DB_HOST`             | required | MySQL host                                                     |
| `DB_PORT`             | `3306`   | MySQL port                                                     |
| `DB_USER`             | required | MySQL user                                                     |
| `DB_PASSWORD`         | required | MySQL password                                                 |
| `DB_NAME`             | required | database name                                                  |
| `DB_SSL`              | `false`  | `true` connects over TLS and verifies the server certificate   |
| `DB_POOL_MAX`         | `10`     | connections per replica                                        |

## API

| Route                            | Success                                                                                               | Errors              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- |
| `GET /posts?limit=20&after=<id>` | `200`, array of posts with `categories`, ascending by `id`; `Link: <...>; rel="next"` when more exist | `400`               |
| `GET /posts/:id`                 | `200`, the post with `categories`                                                                     | `400`, `404`        |
| `POST /posts`                    | `201`, the stored post and `Location: /posts/<id>`                                                    | `400`, `413`, `415` |

`POST /posts` takes `{"title": "...", "text": "...", "categories": [{"name": "..."}]}`: `title`
1-255 characters, `text` 1-10000, at most 10 categories with `name` 1-100, and no other field. The
body is limited to 100 kB.

Errors use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem documents
(`application/problem+json`); a `400` lists each invalid field:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "The request is invalid",
  "errors": [{ "field": "title", "message": "Too big: expected string to have <=255 characters" }]
}
```

Every response carries `X-Request-Id`; a well-formed incoming one is echoed, so it can be
correlated across services and in the logs.

## Operations

| Endpoint       | Use                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /healthz` | liveness: `200` while the process serves HTTP; never touches the database                                            |
| `GET /readyz`  | readiness: `200` when the database answers `SELECT 1` within 1 s, `503` otherwise or while draining                  |
| `GET /metrics` | Prometheus metrics: Node.js process metrics and `http_request_duration_seconds` by method, route template and status |

These three are meant for the orchestrator and the scraper, not for the public route.

- **Logs** are JSON lines on stdout, one per request (`requestId`, `method`, `url`, `statusCode`,
  `responseTime`), without headers or bodies. Probe and metrics requests are not logged.
- **Shutdown**: on SIGTERM or SIGINT the replica turns not-ready, stops accepting connections,
  finishes in-flight requests, closes the database pool and exits 0, or exits 1 after
  `SHUTDOWN_TIMEOUT_MS`.
- **Migrations** never run at startup. Run `yarn migration:run` once per release, before the new
  version takes traffic; MySQL commits each DDL statement separately, so every migration ships
  with a tested `down`.

## Known limitations

- The API has no authentication: anyone who can reach it can create posts. Who may write is a
  product decision still to be made; until then the API must not be exposed without a gateway
  that authenticates callers.
- `POST /posts` is not idempotent: a client retry after a timeout can create a duplicate post.
