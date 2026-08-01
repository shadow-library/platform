# CLAUDE.md — @shadow-library/common

Framework-agnostic core library shared by every app in the Shadow Library ecosystem: errors, config,
logging, caching, HTTP client, reflection, flow state machines, and utilities. Published **ESM-only**
(`type: module`). Currently `2.0.0-beta.0`, private (this monorepo doesn't publish). Requires Node `>=23`;
developed and tested with **Bun**.

All build/verify tooling is centralized in the **root `scripts/` directory** (`bun scripts/verify.ts` /
`bun scripts/build.ts`, invoked by path — there is no `shadow` CLI and no `.shadowrc.json`; both were
retired). There is no local eslint/prettier config — do not add them; a lint deviation would belong in this
package's own `eslint.config.ts` (it currently has none, so it inherits the root ESLint config as-is), and
format options live only in the root `.prettierrc.json`. The toolchain (typescript, eslint, prettier,
tsc-alias, …) is a root devDependency, so this package pins none of them directly.

## Commands

This package's own scripts run from **inside** `packages/common/`; `build`/`verify` are root tooling and
always run from the **repo root** by path.

| Task                                       | Command                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Verify (format + lint + type-check + test) | `bun scripts/verify.ts packages/common` (autofix: `--fix`), from the repo root |
| Run tests                                  | `bun test` (single file: `bun test tests/errors/app.error.spec.ts`)            |
| Type-check                                 | `bun run type-check` (`tsc`)                                                   |
| Build (ESM-only → `dist/`)                 | `bun scripts/build.ts packages/common`, from the repo root                     |

There is no `build` or `verify` script in this package's own `package.json` — they are root tooling only. The
root Husky pre-commit hook fast-verifies (format + lint) whichever workspaces have staged changes; run
`bun scripts/verify.ts packages/common` (format + lint + type-check + test) yourself before committing to
catch the rest.

## Layout

- `src/errors/` — `AppError` (the one error class) + `ErrorCode` (catalog base with category factories) + `ValidationError`. Framework-agnostic.
- `src/services/` — `ConfigService` (env + `.env` files + hot reload via chokidar), `Logger` (winston), `Reflector` (reflect-metadata + deepmerge), `cache/` (LRU + in-memory store). Node-oriented.
- `src/classes/` — `APIRequest` (undici HTTP client), `Task`/`TaskManager`, `FlowManager`/`FlowRegistry` + `FlowErrorCode` (the flow domain's own error catalog).
- `src/interfaces/` — shared types (`Fn`, `Nullable`, `AsType`, pagination, dot-notation, …).
- `src/utils/` — pure helpers (`string`, `object`, `pagination`, `temporal`), exposed as `utils`.
- `package.json` `exports` — the subpath entry-point map. `bun scripts/build.ts` derives its build exports
  directly from this field (stripping the `./dist/` prefix and `.js`/`.d.ts` extensions) to emit the flat ESM
  `dist/` and synthesize `dist/package.json` (`exports`/`typesVersions`/`sideEffects`) — the published contract
  and the build can never drift. There is no `.shadowrc.json`; that config format was retired.

## Conventions (authoritative: README → "Conventions & Standards")

- **Errors.** Never throw bare `Error`, never `new AppError`/`new ErrorCode`. Declare a `<Domain>ErrorCode extends ErrorCode` catalog, one `static readonly` entry per failure built with a category factory (`badRequest`/`notFound`/`conflict`/`internal`/…). Codes are `UPPER_SNAKE_CASE` and semantic — never opaque (`S001`). Throw with `.throw(data?)`, create with `.create(data?)`, match with `AppError.is(err, catalogOrKey)`. `internal` errors are masked in `toResponse()`. Catalogs live with their domain (see `FlowErrorCode` in `src/classes/`), not bolted onto the base `ErrorCode`.
- **Config keys.** Dot-delimited paths of 2–7 segments (`<domain>.<name>` … `<domain>.<area>.<sub>.<name>`); only `[a-z.-]` (lowercase, dots, hyphens — no uppercase/underscores/digits). Env var is derived (`.`/`-` → `_`, uppercased): `db.pool.max` ⇄ `DB_POOL_MAX`. Declare keys+types via `interface X extends ConfigRecords`. Any prefix is subscribable.
- **File style.** Every source file (except barrels) opens with the four banners in order: `Importing npm packages`, `Importing user defined packages`, `Defining types`, `Declaring the constants` (keep empty ones). External imports block, blank line, then internal (`@lib/*` alias + relative). `kebab-case` filenames with role suffix (`*.service.ts`, `*.error.ts`, `*.spec.ts`). Named exports only; each folder has a barrel `index.ts`. 2-space indent, semicolons, 180-col width. Tests are `bun:test`, names start with `should`.

## Gotchas

- **Subpath exports & the framework-agnostic core.** `./errors`, `./utils`, `./cache`, `./interfaces` pull in **no** winston/undici/chokidar, so they stay browser/edge-safe — don't add a Node-only import to those trees. The root barrel (`.`) is deprecated in favour of subpaths. A new subpath is registered in **this package's own `package.json` `exports` field** (mapping the subpath to its `./dist/...` output, no extension) — `bun scripts/build.ts` derives the build's exports from that field directly, so the published contract and the build can never drift. There is no separate `build.exports` config to keep in sync.
- **Native-ESM CJS interop.** Import CJS default-only modules as defaults, e.g. `import deepmerge from 'deepmerge'` then `deepmerge.all(...)` — a named `{ all }` import breaks under Node's native ESM. Bundlers/Bun mask this, so verify with a real Node ESM resolve.
- **Global singletons.** `Config` and `Logger` are stored on `globalThis` so duplicate package copies share one instance. Preserve that pattern.
- **Error exposure.** `toObject()` is full-fidelity (logs/IPC, round-trips via `AppError.from`); `toResponse()` masks internal errors. `from()` fails closed to internal — never loosen that.
- **Git.** Never push to `main`/`master`, force-push, or merge to a remote. Work lands on **local** `main` only unless the user says otherwise.
