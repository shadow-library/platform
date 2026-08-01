# `@shadow-library/auth` — Agent Guide

The **consumer auth SDK** for the Shadow Apps identity platform: Bun-native EdDSA (Ed25519) token verification,
PDP client, M2M service tokens, an OIDC relying-party helper, and framework guards. It is the
**policy-enforcement-point (PEP)** half of the platform; the identity server (`apps/identity-server`) is the
decision half. `type: library`, ESM-only, private — nothing in this monorepo is published —
**JSON/token protocols only, no server state.**

## ⚠️ ALWAYS load the `shadow-library-ecosystem` skill first

At the start of every task, load and follow the `shadow-library-ecosystem` skill. This is a Shadow ecosystem
package; reach for `@shadow-library/{common,app,fastify}` primitives (errors, DI, HTTP context) before
hand-rolling config, logging, errors, or validation.

## Layout

- `src/index.ts` — functional core (`AuthClient`, interfaces, `AuthErrorCode`).
- `src/lib/` — internals: discovery, JWKS, JWT verify, PDP client, token manager, client
  authentication, transport, the app registry (derived configuration), the service-access rule cache,
  and the first-party app-session client plus its access-token cache.
- `src/module/` — framework integration (`@shadow-library/auth/module`): `AuthModule`/`RelyingPartyModule`,
  the wired browser auth controllers, guards, decorators (`Authenticated`, `RequirePermission`,
  `RequireScope`, `RequireElevation`), session cookie/login-state/registry, context augmentation.
- `src/rp/` — OIDC relying party (`@shadow-library/auth/rp`): `RelyingParty`, authorization URL, PKCE.
  **Third-party/external consumers only** — a Shadow app uses `AuthModule.forRoot()`.
- `src/testing/` — test utilities (`@shadow-library/auth/testing`): `createTestIdP`.
- `tests/` — `*.spec.ts`, driven by `bun test`; consume the package through its four public entry points only.

## Commands

| Purpose                                    | Command                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Install                                    | `bun install`                                                                                                                 |
| Verify — format + lint + type-check + test | `bun run verify`                                                                                                              |
| Verify with autofix                        | `bun run verify --fix`                                                                                                        |
| Type-check only                            | `bun run type-check`                                                                                                          |
| Test                                       | `bun test`                                                                                                                    |
| Build                                      | `bun run build`                                                                                                               |
| Release                                    | Retired — this package is private and not published; `shadow commit-msg` + root Husky still enforce the commit-message format |

## Conventions

- **File section banners** open every source file (except barrels), in order, keeping empty ones:
  `Importing npm packages` → `Importing user defined packages` → `Defining types` → `Declaring the constants`.
  npm imports first, then internal, separated by a blank line.
- **Errors** are thrown via the `AuthErrorCode` catalog as `AppError`s (`@shadow-library/common`); never a bare
  `Error`.
- **Named exports**; each folder has a barrel `index.ts`. Public surface is the four `exports` entry points only.
- **kebab-case** filenames with a role suffix; `bun run verify` enforces format (180-width, single quote) + lint.
- The `@shadow-library/{app,common,fastify,class-schema}` peers are dev-installed here for build/test; `common`
  is a required runtime peer, the rest are optional (only needed for the framework module).
- **Never log a token, a session handle, a cookie value, a PKCE verifier, `state`, or `nonce`.** Only a
  `sha256` hash of a handle may be retained, and only as a cache or registry key.
- **Configuration is derived, not restated** (D-21). A deploy sets `AUTH_ISSUER` + `AUTH_APP_ID` + one
  credential; the audience, redirect URIs and granted scopes come from `GET /api/v1/apps/me` and the
  step-up/app-session endpoints from discovery, refreshed on a TTL. Do not reintroduce `AUTH_AUDIENCE`,
  `AUTH_REDIRECT_URI`, `AUTH_SCOPES`, `AUTH_STEP_UP_URL` or `AUTH_SESSION_SECRET` — overrides belong in
  code, where they are visible and reviewed.
- **Failure asymmetry on anything refreshed on a TTL** (app registration, service-access rules): the
  first resolve throws so the boot fails, a later refresh warns and keeps the last good value. An
  identity outage must never change what a running service accepts.
