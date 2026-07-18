# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pulse Server is a multi-channel notification service (SMS, Email, Push, WhatsApp) built on the @shadow-library framework ecosystem with Bun as the runtime. It uses Drizzle ORM with PostgreSQL, Fastify for HTTP, and Mustache for template rendering.

## Commands

```bash
bun run dev              # Start dev server with watch mode
bun run build            # Production build via `shadow build` (single-file dist/main.js + dist/migrate-db.js)
bun run verify           # `shadow verify`: prettier + eslint + type-check + tests (add --fix to autofix)
bun run type-check       # TypeScript type checking (tsc, no emit)
bun test                 # Run all tests
bun test tests/notification/notification.spec.ts  # Run a single test file

# Database
bun run db:create-template  # Create template database (required before tests)
bun run db:migrate          # Run migrations
bun run db:seed             # Seed initial data
```

All scripting (build, lint, format, commit-msg linting, husky hooks) is owned by the `shadow` CLI
(`@shadow-library/scripts`), configured through `.shadowrc.json` — there is no per-repo eslint,
prettier, or commitlint config.

Tests require a running PostgreSQL instance. The template database must be created before running tests (`bun run db:create-template`). Each test file gets its own database cloned from the template via `createDatabaseFromTemplate`.

## Architecture

**Framework:** @shadow-library/app (custom DI framework similar to NestJS) with @shadow-library/fastify for HTTP routing. The app bootstraps via `ShadowFactory` in `src/main.ts`.

**Module structure** (`src/modules/`):

- **notification/** - Core notification delivery with provider abstraction and failover logic
- **template/** - Template groups, variants (locale/channel-specific), and channel settings
- **configuration/** - Sender profiles, endpoints, and routing rules (vendor selection by service/region/message type)
- **metrics/** - Dashboard controller
- **auth/** - The pulse-native remainder of the auth stack: the default-deny `RouteGuardSentinel` + `@Public()` decorator, the RBAC catalog constants, and the first-party session surface (`/api/auth/*`). Bearer verification, `@RequireScope`/`@RequirePermission`, the PDP client, and M2M service-access enforcement come from `@shadow-library/auth/module` (`AuthModule.forRoot` + `AuthGuard`)

Each module follows the pattern: `*.module.ts`, `*.controller.ts`, `*.service.ts`, plus DTOs and domain logic. Modules are registered in `src/modules/dynamic.modules.ts`. Controllers carry explicit full paths (`/api/v1/*` for the versioned surface, `/api/auth/*` for the session surface) — there is no global route prefix or version prefixing.

**Database** (`src/database/`):

- Drizzle ORM with PostgreSQL (Bun's native SQL driver)
- Schemas defined in `src/database/schemas/`
- Database constraint errors are mapped to custom app error codes in `database.constants.ts`
- Type alias `PrimaryDatabase` exported from `database.module.ts`

**Configuration:** Uses `@shadow-library/common` Config system. Key env vars: `DATABASE_POSTGRES_URL`, `LOG_LEVEL`, `APP_STAGE` (dev/staging/prod), `APP_PUBLIC_URL` (prod-required; the RP callback URL is derived from it); auth (loaded by the SDK): `AUTH_ISSUER`, `AUTH_AUDIENCE` (default `shadow-pulse`), `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` (or `AUTH_CLIENT_ASSERTION_PATH`), `AUTH_IDENTITY_RESOURCE` (default `shadow-identity`). Dev fallbacks and prod fail-fast checks for the `AUTH_*` keys live in `src/modules/auth/auth.module.ts`.

**Authentication & Authorization** (`src/modules/auth/`):

- Pulse is an OAuth2 **resource server** standardised on `@shadow-library/auth/module`: `AuthModule.forRoot` provides the `AuthClient` and the shared `AuthGuard` preHandler, which verifies EdDSA bearer tokens offline against the identity JWKS and enforces access per route (401 `IAM_001` / 403 `IAM_002`).
- Route decorators (imported from `@shadow-library/auth/module`): `@Authenticated()`, `@RequireScope('notifications:send')` (token scope), `@RequirePermission('pulse:...')` (identity PDP check in the caller's org). `@Public()` (pulse-native, from `@modules/auth`) exempts a route from the default-deny `RouteGuardSentinel` — the sentinel is a deliberate pulse-specific delta the SDK lacks.
- **M2M callers are deny-by-default**: a service token passes only when an admin-configured service-access rule (loaded from identity at startup via `loadServiceAccess`) covers that route for that caller. Identity's own calls to `POST /api/v1/notifications` must be allow-listed in the identity admin panel.
- **First-party session surface** (`session.controller.ts`, consumed by pulse-web): `GET /api/auth/login?returnTo=` starts the OIDC code+PKCE flow via the SDK `RelyingParty`, `GET /api/auth/callback` exchanges the code and stores the pulse-audience access token in the `pulse_session` httpOnly cookie, `GET /api/auth/session` returns flat `{ userId, email?, name? }` or 401, `POST /api/auth/logout` clears the cookie.
- The RBAC catalog (`rbac.constants.ts`) — permissions `pulse:{templates,senders}:{read,write}`, `pulse:metrics:read`, `pulse:logs:read`; scope `notifications:send`; roles PulseViewer/Operator/Admin — is seeded into identity by its BootstrapService, so the strings must stay in sync (SDK role sync is intentionally not enabled).

## Path Aliases

```
@modules/*  -> src/modules/*
@server/*   -> src/*
@scripts/*  -> scripts/*
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
- Lint/format rules ship with `shadow verify` (typescript-eslint strict + stylistic, perfectionist import sorting, prettier base rules); repo overrides live in `.shadowrc.json`
- Errors: throw `AppErrorCode.X.create()` (ErrorCode catalogs from `@shadow-library/common` 2.0); the `ServerError` class no longer exists
