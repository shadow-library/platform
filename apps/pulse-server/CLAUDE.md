# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pulse Server is a multi-channel notification service (SMS, Email, Push, WhatsApp) built on the @shadow-library framework ecosystem with Bun as the runtime. It uses Drizzle ORM with PostgreSQL, Fastify for HTTP, and Mustache for template rendering.

## Commands

```bash
bun run dev              # Start dev server with watch mode
bun run build            # Production build (bundles to dist/)
bun run lint             # Run prettier + eslint with --fix
bun run type-check       # TypeScript type checking (tsc, no emit)
bun test                 # Run all tests
bun test tests/notification/notification.spec.ts  # Run a single test file

# Database
bun run db:create-template  # Create template database (required before tests)
bun run db:migrate          # Run migrations
bun run db:seed             # Seed initial data
```

Tests require a running PostgreSQL instance. The template database must be created before running tests (`bun run db:create-template`). Each test file gets its own database cloned from the template via `createDatabaseFromTemplate`.

## Architecture

**Framework:** @shadow-library/app (custom DI framework similar to NestJS) with @shadow-library/fastify for HTTP routing. The app bootstraps via `ShadowFactory` in `src/main.ts`.

**Module structure** (`src/modules/`):

- **notification/** - Core notification delivery with provider abstraction and failover logic
- **template/** - Template groups, variants (locale/channel-specific), and channel settings
- **configuration/** - Sender profiles, endpoints, and routing rules (vendor selection by service/region/message type)
- **metrics/** - Dashboard controller
- **auth/** - OAuth2 resource-server integration (`@shadow-library/auth`): bearer verification, the RBAC guard + route decorators, and a default-deny sentinel

Each module follows the pattern: `*.module.ts`, `*.controller.ts`, `*.service.ts`, plus DTOs and domain logic. Modules are registered in `src/modules/dynamic.modules.ts` which sets up HTTP routing with prefix `/api` and versioning.

**Database** (`src/database/`):

- Drizzle ORM with PostgreSQL (Bun's native SQL driver)
- Schemas defined in `src/database/schemas/`
- Database constraint errors are mapped to custom app error codes in `database.constants.ts`
- Type alias `PrimaryDatabase` exported from `database.module.ts`

**Configuration:** Uses `@shadow-library/common` Config system. Key env vars: `DATABASE_POSTGRES_URL`, `LOG_LEVEL`, `APP_STAGE` (dev/staging/prod); auth: `AUTH_ISSUER`, `AUTH_AUDIENCE` (default `shadow-pulse`), `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `AUTH_IDENTITY_RESOURCE` (default `shadow-identity`).

**Authentication & Authorization** (`src/modules/auth/`):

- Pulse is an OAuth2 **resource server**: the `AuthGuard` preHandler verifies EdDSA bearer tokens offline against the identity JWKS and enforces access per route. Only the SDK's framework-free functional core (`createAuthClient`) is used; the decorators and guard are pulse-native so all router/DI metadata lives in a single framework instance.
- Route decorators (imported from `@modules/auth`): `@RequireScope('notifications:send')` gates machine-to-machine sending (token scope only, no PDP); `@RequirePermission('pulse:...')` calls the identity PDP (`POST /api/v1/authz/check`) in the caller's org; `@Public()` exempts a route from the default-deny `RouteGuardSentinel`.
- The RBAC catalog (`rbac.constants.ts`) — permissions `pulse:{templates,senders}:{read,write}`, `pulse:metrics:read`, `pulse:logs:read`; scope `notifications:send`; roles PulseViewer/Operator/Admin — is seeded into identity by its BootstrapService, so the strings must stay in sync.

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
- App lifecycle (beforeAll/afterAll)
- Mocks `NotificationService.executeNotificationJob` to avoid real provider calls
- Boots an in-process mock IdP (`@shadow-library/auth/testing`) and injects auth config before init
- Provides `getRouter()` for HTTP assertions via `Router.mockRequest()`, plus `authHeaders()`/`userHeaders()`/`serviceHeaders()` for authenticated requests

## Commit Convention

Conventional Commits format: `<type>(<scope>): <subject>` (max 70 chars). Types: feat, fix, refactor, build, chore, ci, docs, perf, style, test, sample. Subject uses imperative present tense, no capitalization, no trailing period.

## Code Style

- Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`)
- ESModules (`"type": "module"`)
- Prettier: single quotes, trailing commas, 180 char print width, no parens on single arrow params
- ESLint: typescript-eslint strict + stylistic, import ordering enforced, no console
