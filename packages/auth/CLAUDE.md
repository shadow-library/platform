# `@shadow-library/auth` — Agent Guide

The **consumer auth SDK** for the Shadow Apps identity platform: Bun-native EdDSA (Ed25519) token verification,
PDP client, M2M service tokens, an OIDC relying-party helper, and framework guards. It is the
**policy-enforcement-point (PEP)** half of the platform; the identity server (a separate repo) is the decision
half. This is a published library (`type: library`, ESM-only) — **JSON/token protocols only, no server state.**

## ⚠️ ALWAYS load the `shadow-library-ecosystem` skill first

At the start of every task, load and follow the `shadow-library-ecosystem` skill. This is a Shadow ecosystem
package; reach for `@shadow-library/{common,app,fastify}` primitives (errors, DI, HTTP context) before
hand-rolling config, logging, errors, or validation.

## Layout

- `src/index.ts` — functional core (`AuthClient`, interfaces, `AuthErrorCode`).
- `src/lib/` — internals: discovery, JWKS, JWT verify, PDP client, token manager, transport.
- `src/module/` — framework integration (`@shadow-library/auth/module`): `AuthModule`/`RelyingPartyModule`,
  guards, decorators (`Authenticated`, `RequirePermission`, `RequireScope`), context augmentation.
- `src/rp/` — OIDC relying party (`@shadow-library/auth/rp`): `RelyingParty`, PKCE.
- `src/testing/` — test utilities (`@shadow-library/auth/testing`): `createTestIdP`.
- `tests/` — `*.spec.ts`, driven by `bun test`; consume the package through its four public entry points only.

## Commands

| Purpose | Command |
|---|---|
| Install | `bun install` |
| Verify — format + lint + type-check + test | `bun run verify` |
| Verify with autofix | `bunx shadow verify --fix` |
| Type-check only | `bun run type-check` |
| Test | `bun test` |
| Build | `bun run build` |
| Release (npm + changelog) | `bunx shadow release <level>` |

## Conventions

- **File section banners** open every source file (except barrels), in order, keeping empty ones:
  `Importing npm packages` → `Importing user defined packages` → `Defining types` → `Declaring the constants`.
  npm imports first, then internal, separated by a blank line.
- **Errors** are thrown via the `AuthErrorCode` catalog as `AppError`s (`@shadow-library/common`); never a bare
  `Error`.
- **Named exports**; each folder has a barrel `index.ts`. Public surface is the four `exports` entry points only.
- **kebab-case** filenames with a role suffix; `bun run verify` enforces format (180-width, single quote) + lint.
- The `@shadow-library/{app,common,fastify}` peers are dev-installed here for build/test; `common` is a required
  runtime peer, `app`/`fastify` are optional (only needed for the framework module).
