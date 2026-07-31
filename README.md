# Shadow Library Platform

The Shadow Library platform monorepo: four products and the shared package ecosystem they build on, developed, verified, and shipped as one system — **built and operated by one person**.

## The products

| Product | What it is | Live |
| --- | --- | --- |
| **Identity** | The platform's identity provider: OAuth 2.1 / OIDC, first-party app sessions, step-up auth, M2M tokens, and an admin surface for app registration and access control. | [identity.shadow-apps.com](https://identity.shadow-apps.com) |
| **Novel Forge** | AI-assisted novel authoring: story bibles, arc/volume planning, chapter generation with judge/repair loops, epistemic character-knowledge tracking, and a documented bundle-import feature for bringing manuscripts in. | — |
| **Pulse** | Platform notifications and activity: template catalog, multi-channel delivery, and a dashboard. | [pulse.shadow-apps.com](https://pulse.shadow-apps.com) |
| **Web Novel** | The public reading platform: published novels flow one-way from Novel Forge into a fast, cache-first reader. | [webnovel.shadow-apps.com](https://webnovel.shadow-apps.com) |

Each product is a server (Bun + Fastify-style HTTP over a custom DI kernel, PostgreSQL + Drizzle) and a web app (React 19; SSR via TanStack Start) — eight independently deployable applications.

## The architecture

```text
apps/                     8 applications — the four products, server + web each
packages/
  common                  config, structured logging, error taxonomy, caches, task/flow orchestration, HTTP client
  app                     dependency-injection kernel: modules, providers, lifecycle, interceptors
  class-schema            decorator-driven DTOs → JSON Schema (validation + serialization)
  fastify                 decorator HTTP layer: controllers, routes, guards, transforms
  auth                    the identity SDK: first-party login, route guards, M2M, offline verification
  modules                 HTTP core (security/openapi/health), database (Postgres/Redis), caching, pagination
  ui                      the React component library + design tokens
  web                     frontend wiring: transport, router/SSR, PWA, production server
e2e/                      cross-app Playwright suite, run against deployed instances via E2E_* env vars
scripts/                  the repo's own tooling (build, verify, commit lint, API-type generation)
docker/                   one parameterized Dockerfile builds every app from the repo root
```

Everything internal resolves as `workspace:*` — nothing is published to npm; a breaking package change and every consumer fix land in the same commit, enforced by affected-workspace CI and the cross-app e2e suite.

## Working in the repo

```bash
bun install                       # one lockfile, all workspaces
bun run --filter '*' verify       # dependency-ordered: format, lint, type-check, tests
bun run --filter '*' build        # build every workspace
docker build -f docker/Dockerfile --build-arg APP=<app> --target runtime-<kind> .
```

Agent tooling ships with the repo: `.mcp.json` (Serena, Context7, Playwright MCP), `AGENTS.md` conventions, and the `shadow-library-ecosystem` skill under `.claude/skills/`.

## License

Copyright © Leander Paul. All rights reserved. The source is available for reading and evaluation; no license is granted for use, modification, or redistribution.
