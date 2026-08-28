# web-novel-server

The public webnovel reader backend: the authoritative **serving copy** of a projection owned by
`novel-forge-server`. The forge pushes published novels and chapters one way over the internal
publish API; readers browse and read them over the public API; reader identity comes from the
Shadow identity service (OIDC) — this app keeps **no local user or session tables**. See `CLAUDE.md`
for conventions and commands.

## Surfaces

| Surface                                | Paths                                                                                                                                                                                                    | Auth                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Internal publish (publishers → reader) | `PUT /internal/novels/:slug`, `PUT`/`GET .../access`, `PUT`/`DELETE .../chapters/:ordinal`, `PUT`/`DELETE .../wiki/:entryKey`, `GET .../manifest`, `GET .../wiki/manifest`                               | Identity-issued M2M bearer with scope `web-novel:publish` + admin-configured service-access rule |
| Public catalog                         | `GET /api/novels` (search/genre/status/sort/pagination), `GET /api/novels/:slug`, `GET /api/novels/:slug/chapters`, `GET /api/novels/:slug/chapters/:ordinal` (ETag = contentHash, 304 on If-None-Match) | none                                                                                             |
| Session                                | `GET /api/auth/login?returnTo=`, `GET /api/auth/callback`, `GET /api/auth/session` (flat `{ userId, email?, name? }` or 401), `POST /api/auth/logout`                                                    | OIDC via identity; stateless signed session cookie                                               |
| Reader                                 | `GET /api/me/progress`, `GET`/`PUT /api/novels/:slug/progress`, `GET`/`POST /api/library`, `DELETE /api/library/:slug`                                                                                   | session cookie                                                                                   |
| Health                                 | `GET /health`, `GET /health/ready` on :8080; `/health/live` + `/health/ready` on :8081 (`HEALTH_ENABLED`)                                                                                                | none                                                                                             |

## Publish semantics

Optimistic concurrency, revisions are forge-assigned and monotonic: incoming revision **below** stored →
`409` (`WBN_003`, audited `stale_rejected`); **equal** revision with identical content → `204` no-op;
anything else upserts and stores the incoming revision. Every internal mutation call — including every
rejected attempt — writes exactly one `publish_audit_log` row. Unpublish is idempotent. `GET
.../manifest` returns `[{ ordinal, contentHash, revision }]` for forge-side reconciliation and is not
audited.

A slug belongs to the client that created it (`novels.source_client_id`, stamped from the authenticated
principal), and only that client may mutate it. A mutation on a slug owned by another publisher is `409`
(`WBN_010`, audited `unauthorized`) and is **retryable under a different slug** — unlike `WBN_003`, which is
fatal — so publishers discriminate on the code, not the status. A read of a foreign-owned slug answers `404`
(`WBN_001`) exactly as an unknown slug does; the owning client is never named.

## Running locally

Without `AUTH_CLIENT_ID` the app boots offline and every M2M caller is denied (fail closed).
`SESSION_*` configures the OIDC relying-party client and the session-cookie secret.

## Building and shipping

The image build is monorepo-root-context — see this workspace's own
[`Dockerfile`](./Dockerfile) header comment for the exact command
(`docker build -f apps/web-novel-server/Dockerfile --build-arg APP_VERSION=$(git rev-parse --short HEAD) .`,
run from the repo root, not this directory).

## Hard rules (from the reader-publish design)

1. Content flows one direction: forge → reader; every fix is a forge republish.
2. The content tables are a rebuildable projection — wipe + re-push must converge.
3. Audience data (progress, library) originates here and never crosses back to the forge.
