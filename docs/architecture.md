# Platform Architecture

## Topology

- Five products (`identity`, `novel-forge`, `pulse`, `web-novel`, `memoir`), each a server + web pair: ten independently built and deployed apps.
- Server: Bun + Fastify over the in-house DI kernel, PostgreSQL via Drizzle; JSON/REST, except identity-server which also speaks OAuth2, SAML2 and SCIM. Web: React + TanStack
  Start SSR; `web-novel-web` and `memoir-web` are also PWAs.
- The browser calls the paired server same-origin: `/api/*` plus `/auth/*` (and `/oauth2`, `/saml2` on identity); SSR calls the server directly. Web apps hold no auth logic and,
  except offline-first `memoir-web` (which projects domain state client-side), no business logic.
- Naming trap: `apps/identity-server` is the package `@shadow-library/identity`. Web-novel's runtime identifiers are unhyphenated `webnovel`, unlike its workspace name. `identity-server` ships a `worker` entrypoint; memoir's exists but registers no sweeps.

## Integrations

```text
every server but identity ──auth SDK──> identity   (login, PDP checks, M2M tokens; identity registers every app)
identity, memoir ──M2M──> pulse                    (notifications sink)
novel-forge ──M2M, one-way──> web-novel            (publish)
identity ──svc://novel-forge-server/internal/bots/*──> novel-forge   (bot ownership; the only app that opts in today)
```

- **Identity is the only authority for authentication and authorization.** Consumers enforce (PEP); Identity decides (PDP). `identity-server` does not use `@shadow-library/auth`.
  Service-to-service access is deny-by-default: a new cross-app call MUST be authorised by a service-access rule seeded in identity.
- **Pulse is a sink.** Callers send by template key with an M2M token; no human role can call send. Identity drains its notification outbox in its `worker` entrypoint, memoir on
  the server's in-process scheduler. Pulse never calls other apps.
- **Novel Forge to Web Novel is one-way.** Web Novel is a serving copy that never writes back and stores no forge internals; Forge pushes with an M2M token and monotonic revisions.
  Content integrity is the hash contract in `@shadow-library/sdk` (`docs/packages.md`).
- **Service-to-service addressing** uses `svc://<service>`. NEVER hard-code hostnames.
- **Cross-app data access is forbidden.** No app reads another app's database; only the HTTP integrations above exist (the e2e suite seeds and reads databases directly, for tests only). There is no shared
  AI service.

## Contract-first API types

- Every server serves an OpenAPI document (in dev, at `/dev/api-docs/openapi.json`); every web app commits a generated `api-types.gen.ts` from its paired server (`apps/<x>-server` with `apps/<x>-web`). Never hand-write
  API shapes.
- The contract is NOT atomic: a server DTO/route change requires regenerating the paired web app's types and fixing its callers in the same coordinated change.
- CI's drift check (`bun scripts/gen-api-types.ts <web-app> --check`) does not catch a web-only hand edit of the generated file.

## Data stores

- Each server owns one PostgreSQL database; migrations are applied by a separate `migrate` entrypoint, not on server boot. Redis is Identity-only (opaque sessions). Object storage (`@shadow-library/modules/storage`) holds
  blobs for novel-forge, web-novel and memoir.
- Web Novel's catalog, chapter and wiki tables are a projection of Forge content, rebuilt by re-pushing; its reader tables (library, progress) and publish audit are native and
  cannot be rebuilt from Forge.

## Deploy shape

- Each app's hand-maintained Dockerfile copies every workspace's `package.json`: adding or removing a workspace means editing all ten. Deployment lives in the `devops` repo.

## Monorepo hard rules

- Internal dependencies are `workspace:*`; dependencies point only downward (layering in `docs/packages.md`). `version` fields are frozen and meaningless: do not bump them.
- A breaking change in `packages/*` MUST fix every first-party consumer in the same change. Never leave callers to a follow-up.
- Everything runs from the repo root (`bun scripts/verify.ts <ws>`, `bun scripts/build.ts <ws>`); workspaces have no `build`/`verify`/`generate:api-types` scripts (a `test` script, and `build:app` referenced from the `"shadow"` key, are the exceptions), and husky hooks are root-only.
- Tooling is convention-driven: one root `eslint.config.ts` (deviations are `files`-scoped blocks), root-only format/commit config, non-inferable build inputs in a `"shadow"`
  key in that `package.json`.
- A new workspace needs only `package.json`, a `tsconfig.json` extending its family file, and source.
- CI verifies each affected workspace; a change under `packages/`, `scripts/` or root config verifies all. CI also verifies `e2e` (lint/type-check only); the Playwright suite itself is run by hand against a reachable deployment (default: the local k3d ingress).

## Agent doc-usage rule

- Before working in an app, read `docs/overview.md` and `docs/<app>.md`; before cross-app work, this file; before touching a package, `docs/packages.md`.
- Docs hold intent and invariants only; anything derivable from code is read from code. If code and a doc disagree, the code wins: fix the doc.
- Load the `shadow-library-ecosystem` skill before writing code. Do not add task lists, changelogs or status banners to `docs/`.
