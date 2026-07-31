# web-novel-server

The public webnovel reader backend: the authoritative **serving copy** of a projection owned by
`novel-forge-server`. The forge pushes published novels and chapters one way over the internal
publish API; readers browse and read them over the public API; reader identity comes from the
Shadow identity service (OIDC) — this app keeps **no local user or session tables**.

## Surfaces

| Surface | Paths | Auth |
| --- | --- | --- |
| Internal publish (forge → reader) | `PUT /internal/novels/:slug`, `PUT`/`DELETE /internal/novels/:slug/chapters/:ordinal`, `GET /internal/novels/:slug/manifest` | Identity-issued M2M bearer with scope `webnovel:publish` + admin-configured service-access rule |
| Public catalog | `GET /api/novels` (search/genre/status/sort/pagination), `GET /api/novels/:slug`, `GET /api/novels/:slug/chapters`, `GET /api/novels/:slug/chapters/:ordinal` (ETag = contentHash, 304 on If-None-Match) | none |
| Session | `GET /api/auth/login?returnTo=`, `GET /api/auth/callback`, `GET /api/auth/session` (flat `{ userId, email?, name? }` or 401), `POST /api/auth/logout` | OIDC via identity; stateless signed session cookie |
| Reader | `GET /api/me/progress`, `GET`/`PUT /api/novels/:slug/progress`, `GET`/`POST /api/library`, `DELETE /api/library/:slug` | session cookie |
| Health | `GET /health`, `GET /health/ready` on :8080; `/health/live` + `/health/ready` on :8081 (`HEALTH_ENABLED`) | none |

Publish semantics (optimistic concurrency, revisions are forge-assigned and monotonic): incoming
revision **below** stored → `409` (`WBN_003`, audited `stale_rejected`); **equal** revision with
identical content → `204` no-op; anything else upserts and stores the incoming revision. Every
internal mutation call — including every rejected attempt — writes exactly one `publish_audit_log`
row. Unpublish is idempotent. `GET .../manifest` returns `[{ ordinal, contentHash, revision }]`
for forge-side reconciliation and is not audited.

## Running locally

Prerequisites: [Bun](https://bun.sh) ≥ 1.3 and PostgreSQL (dev default
`postgresql://postgres:postgres@localhost:5432/shadow_webnovel` — see `.env`).

```bash
bun install
bun run db:migrate       # apply generated/drizzle to the configured database
bun run dev              # start with reload on :8080
```

The committed `.env` carries dev-only defaults. `AUTH_ISSUER`/`AUTH_AUDIENCE` configure the trusted
identity issuer; without `AUTH_CLIENT_ID` the app boots offline and every M2M caller is denied
(fail closed). `SESSION_*` configures the OIDC relying-party client and the session-cookie secret.

## Testing

```bash
bun test                 # live Postgres: builds a migrated template DB, clones it per test
bun run verify           # shadow verify: format + lint + type-check + test (pre-commit gate)
```

The suite is self-contained: a mock identity provider (`@shadow-library/auth/testing`) boots
in-process and serves discovery/JWKS/token/service-access, so no identity deployment is needed.

## Building and shipping

```bash
bun run build            # shadow build → single-file dist/main.js (+ generated/drizzle assets)
bun dist/main.js         # run the production bundle
```

The image build is now shared and monorepo-root-context — see [`docker/README.md`](../../docker/README.md)
for the exact command (`docker build -f docker/Dockerfile --target runtime-backend --build-arg
APP=web-novel-server ...`, run from the repo root, not this directory).

Ports: `8080` app (`/health`, `/health/ready`), `8081` HttpCoreModule health server
(enable with `HEALTH_ENABLED=true`; on by default in production).

## Hard rules (from the reader-publish design)

1. Content flows one direction: forge → reader; every fix is a forge republish.
2. The content tables are a rebuildable projection — wipe + re-push must converge.
3. Audience data (progress, library) originates here and never crosses back to the forge.
