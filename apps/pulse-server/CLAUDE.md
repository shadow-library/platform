# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pulse Server is a multi-channel notification service (SMS, Email, Push, WhatsApp) built on the @shadow-library framework ecosystem with Bun as the runtime. It uses Drizzle ORM with PostgreSQL, Fastify for HTTP, and a sandboxed LiquidJS engine for template rendering (with `juice` inlining CSS for email).

## Commands

```bash
bun run dev              # Start dev server with watch mode
bun test                 # Run all tests
bun test tests/notification/notification.spec.ts  # Run a single test file

# From the repo root, by workspace path — this workspace has no build/verify/type-check/db:* script:
bun scripts/build.ts apps/pulse-server    # single-file dist/main.js + dist/migrate.js
bun scripts/verify.ts apps/pulse-server   # prettier + eslint + type-check + tests (add --fix to autofix)
bunx tsc -p apps/pulse-server/tsconfig.json --noEmit   # type-check only

# Database (also from the repo root)
bun scripts/db.ts apps/pulse-server create-template  # Create template database (required before tests)
bun scripts/db.ts apps/pulse-server migrate          # Run migrations
bun scripts/db.ts apps/pulse-server seed             # Seed initial data
```

All root-tooling scripting (build, lint, format, commit-msg linting) is convention-driven, invoked by path
from `scripts/` — there is no `shadow` CLI and no `.shadowrc.json`; both were retired. Lint lives in a
single root `eslint.config.ts` — this workspace has no `eslint.config.ts` of its own; its lint deviations
(e.g. `@typescript-eslint/no-namespace` off for the Fastify request augmentations) are `apps/pulse-server/**`-scoped
blocks in that root file. There is no per-repo Prettier or commitlint config either. Husky hooks live once
at the repo root, not per-package.

Tests require a running PostgreSQL instance. The template database must be created before running tests (`bun scripts/db.ts apps/pulse-server create-template`, from the repo root). Each test file gets its own database cloned from the template via `createDatabaseFromTemplate`.

## Architecture

**Framework:** @shadow-library/app (custom DI framework similar to NestJS) with @shadow-library/fastify for HTTP routing. The app bootstraps via `ShadowFactory` in `src/main.ts`.

**Module structure** (`src/modules/`):

- **notification/** - Core notification delivery with provider abstraction and failover logic
- **template/** - The template CMS: templates with an immutable version publishing lifecycle (draft → published), per-`(version, channel, locale)` content, channel settings, and a declared variable-schema contract, plus reusable **layouts** (email shells) and **partials** (Liquid `{% render %}` blocks). Controllers: `TemplateController`, `TemplateVersionController`, `LayoutController`, `PartialController`; rendering + resolution live in `rendering/template-engine.service.ts` and `template-resolver.service.ts`. See `docs/proposals/0001-template-cms.md`.
- **configuration/** - Sender profiles, endpoints, and routing rules (vendor selection by service/region/message type)
- **metrics/** - Dashboard controller
- **auth/** - The pulse-native remainder of the auth stack: the default-deny `RouteGuardSentinel` + `@Public()` decorator, the RBAC catalog constants, and the `/api/auth` base-path constant. Bearer verification, `@RequireScope`/`@RequirePermission`, the PDP client, M2M service-access enforcement, **and the complete first-party browser login flow** (`/api/auth/*`) all come from `@shadow-library/auth/module` (`AuthModule.forRoot` + `AuthGuard`) — pulse no longer implements its own login/callback/logout/session

Each module follows the pattern: `*.module.ts`, `*.controller.ts`, `*.service.ts`, plus DTOs and domain logic. Modules are registered in `src/modules/dynamic.modules.ts`. Controllers carry explicit full paths (`/api/v1/*` for the versioned surface, `/api/auth/*` for the session surface) — there is no global route prefix or version prefixing.

**Database** (`src/database/`):

- Drizzle ORM with PostgreSQL (Bun's native SQL driver)
- Schemas defined in `src/database/schemas/`
- Database constraint errors are mapped to custom app error codes in `database.constants.ts`
- Type alias `PrimaryDatabase` exported from `database.module.ts`

**Configuration:** Uses `@shadow-library/common` Config system. Pulse-owned env vars: `DATABASE_POSTGRES_URL`, `LOG_LEVEL`, `APP_STAGE` (dev/staging/prod).

The entire auth surface is declared and loaded by `@shadow-library/auth/module` (the v1.1 "derived configuration" SDK), so pulse restates none of it. A steady-state deploy sets exactly three things plus one credential:

| Env var                      | Meaning                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `AUTH_ISSUER`                | Identity base URL; must match identity's issuer exactly (a trailing-slash mismatch is a blanket 401) |
| `AUTH_APP_ID`                | Pulse's app id at identity (`pulse`); doubles as the OAuth client id. Prod-required                  |
| `AUTH_CLIENT_SECRET`         | Static client secret — the credential outside the cluster                                            |
| `AUTH_CLIENT_ASSERTION_PATH` | Projected k8s SA token — the preferred in-cluster credential (use instead of the secret)             |

The audience (`api://pulse`), redirect URIs (`{origin}/api/auth/callback`), and granted scopes (`authz:check`, `authz:roles:sync`, `app-session:manage`) are **derived** from `GET {AUTH_ISSUER}/api/v1/apps/me` at boot and refreshed on a TTL — never set in a pulse env var. Optional local-dev-over-http knobs (the session cookie defaults to the `__Host-`-prefixed, `Secure` `__Host-shadow-session`): `AUTH_SESSION_COOKIE_SECURE=false` (drops `Secure` + the `__Host-` prefix), `AUTH_SESSION_COOKIE_NAME`, `AUTH_SESSION_COOKIE_SAME_SITE`. `APP_PUBLIC_URL`, `AUTH_AUDIENCE`, `AUTH_IDENTITY_RESOURCE`, `APP_CLIENT_ID`/`APP_CLIENT_SECRET` are all **gone**.

**Authentication & Authorization** (`src/modules/auth/`):

- Pulse is an OAuth2 **resource server** standardised on `@shadow-library/auth/module`: `AuthModule.forRoot` provides the `AuthClient` and the shared `AuthGuard` preHandler, which verifies EdDSA bearer tokens offline against the identity JWKS and enforces access per route (401 `IAM_001` / 403 `IAM_002`).
- Route decorators (imported from `@shadow-library/auth/module`): `@Authenticated()`, `@RequireScope('notifications:send')` (token scope), `@RequirePermission('pulse:...')` (identity PDP check in the caller's org), `@RequireElevation()` (AAL2). `@Public()` (pulse-native, from `@modules/auth`) exempts a route from the default-deny `RouteGuardSentinel` — the sentinel is a deliberate pulse-specific delta the SDK lacks. The sentinel also recognises the SDK's own `/api/auth/*` routes (which carry no auth decorator) as declared-public via the shared `AUTH_ROUTES_BASE_PATH` constant.
- **M2M callers are deny-by-default**: a service token passes only when an admin-configured service-access rule (loaded from identity at startup) covers that route for that caller. Identity's own calls to `POST /api/v1/notifications` (client `identity-server`, scope `notifications:send`) must be allow-listed in the identity admin panel.
- **First-party session surface** (owned end-to-end by `AuthModule.forRoot`, consumed by pulse-web): `GET /api/auth/login?return_to=` starts PKCE and redirects to identity, `GET /api/auth/callback` redeems the code for an **opaque app-session handle** stored in the `__Host-shadow-session` httpOnly cookie (never a token), `GET /api/auth/session` returns `{ sub, scopes, org?, aal?, clientId? }` or 401, `POST /api/auth/logout` ends the app session and clears the cookie, `GET /api/auth/step-up` drives AAL2 elevation. The SDK mints access tokens server-to-server from the handle; pulse holds no tokens at rest.
- The RBAC catalog (`rbac.constants.ts`) — permissions `pulse:{templates,senders}:{read,write}`, `pulse:metrics:read`, `pulse:logs:read`; scope `notifications:send`; roles PulseViewer/Operator/Admin — is seeded into identity by its BootstrapService, so the strings must stay in sync (SDK role sync is intentionally not enabled).

## Path Aliases

```
@modules/*  -> src/modules/*
@server/*   -> src/*
@tests/*    -> tests/*
```

## Testing

Tests use Bun's native test runner (`bun:test`). Test files live in `tests/` with `.spec.ts` suffix, mirroring the module structure.

`TestEnvironment` class (`tests/test-environment.ts`) handles:

- Per-test database isolation (clones template DB with unique suffix per spec file)
- App lifecycle (beforeAll/afterAll); `AppModule` is imported dynamically after the mock-IdP config is injected because the SDK's `AuthModule.forRoot` snapshots config when the module graph loads
- Mocks `NotificationService.executeNotificationJob` to avoid real provider calls
- Boots an in-process mock IdP (`@shadow-library/auth/testing`), injects auth config, and configures the M2M service-access rules (identity → `POST /api/v1/notifications`, plus a blanket `test-service` allowance) before init
- Provides `getRouter()` for HTTP assertions via `app.get(Dispatcher) as FastifyRouter` and `mockRequest()`, plus `authHeaders()`/`userHeaders()`/`serviceHeaders()` for authenticated requests

## Commit Convention

Conventional Commits format: `<type>(<scope>): <subject>` (max 70 chars). Types: feat, fix, refactor, build, chore, ci, docs, perf, style, test, sample. Subject uses imperative present tense, no capitalization, no trailing period.

## Code Style

- Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`), TypeScript 6.x (no `baseUrl`; `./`-relative `paths`)
- ESModules (`"type": "module"`); the whole @shadow-library 2.0 line is ESM-only
- Lint/format rules ship with `bun scripts/verify.ts` (typescript-eslint strict + stylistic, perfectionist import sorting, prettier base rules); this workspace's deviations live as `apps/pulse-server/**`-scoped blocks in the single root `eslint.config.ts`, not a local config file
- Errors: throw `AppErrorCode.X.create()` (ErrorCode catalogs from `@shadow-library/common` 2.0); the `ServerError` class no longer exists
