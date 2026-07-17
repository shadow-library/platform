# CLAUDE.md — @shadow-library/common

Framework-agnostic core library shared by every app in the Shadow Library ecosystem: errors, config,
logging, caching, HTTP client, reflection, flow state machines, and utilities. Published dual ESM/CJS.
Currently `2.0.0-beta.0` (unreleased). Requires Node `>=23`; developed and tested with **Bun**.

## Commands

| Task | Command |
| --- | --- |
| Run tests | `bun test` (single file: `bun test tests/errors/app.error.spec.ts`) |
| Type-check | `bun run type-check` (`tsc --noEmit`) |
| Lint | `bun run lint` |
| Build (dual ESM/CJS → `dist/`) | `bun run build` |

The husky pre-commit hook runs lint + type-check + `bun test`; keep all three green before committing.

## Layout

- `src/errors/` — `AppError` (the one error class) + `ErrorCode` (catalog base with category factories) + `ValidationError`. Framework-agnostic.
- `src/services/` — `ConfigService` (env + `.env` files + hot reload via chokidar), `Logger` (winston), `Reflector` (reflect-metadata + deepmerge), `cache/` (LRU + in-memory store). Node-oriented.
- `src/classes/` — `APIRequest` (undici HTTP client), `Task`/`TaskManager`, `FlowManager`/`FlowRegistry` + `FlowErrorCode` (the flow domain's own error catalog).
- `src/interfaces/` — shared types (`Fn`, `Nullable`, `AsType`, pagination, dot-notation, …).
- `src/utils/` — pure helpers (`string`, `object`, `pagination`, `temporal`), exposed as `utils`.
- `scripts/build.ts` — owns the `exports` map (subpath entry points) and the dual build.

## Conventions (authoritative: README → "Conventions & Standards")

- **Errors.** Never throw bare `Error`, never `new AppError`/`new ErrorCode`. Declare a `<Domain>ErrorCode extends ErrorCode` catalog, one `static readonly` entry per failure built with a category factory (`badRequest`/`notFound`/`conflict`/`internal`/…). Codes are `UPPER_SNAKE_CASE` and semantic — never opaque (`S001`). Throw with `.throw(data?)`, create with `.create(data?)`, match with `AppError.is(err, catalogOrKey)`. `internal` errors are masked in `toResponse()`. Catalogs live with their domain (see `FlowErrorCode` in `src/classes/`), not bolted onto the base `ErrorCode`.
- **Config keys.** Dot-delimited paths of 2–7 segments (`<domain>.<name>` … `<domain>.<area>.<sub>.<name>`); only `[a-z.-]` (lowercase, dots, hyphens — no uppercase/underscores/digits). Env var is derived (`.`/`-` → `_`, uppercased): `db.pool.max` ⇄ `DB_POOL_MAX`. Declare keys+types via `interface X extends ConfigRecords`. Any prefix is subscribable.
- **File style.** Every source file (except barrels) opens with the four banners in order: `Importing npm packages`, `Importing user defined packages`, `Defining types`, `Declaring the constants` (keep empty ones). External imports block, blank line, then internal (`@lib/*` alias + relative). `kebab-case` filenames with role suffix (`*.service.ts`, `*.error.ts`, `*.spec.ts`). Named exports only; each folder has a barrel `index.ts`. 2-space indent, semicolons, 180-col width. Tests are `bun:test`, names start with `should`.

## Gotchas

- **Subpath exports & the framework-agnostic core.** `./errors`, `./utils`, `./cache`, `./interfaces` pull in **no** winston/undici/chokidar, so they stay browser/edge-safe — don't add a Node-only import to those trees. The root barrel (`.`) is deprecated in favour of subpaths. New subpaths must be registered in `scripts/build.ts`.
- **Native-ESM CJS interop.** Import CJS default-only modules as defaults, e.g. `import deepmerge from 'deepmerge'` then `deepmerge.all(...)` — a named `{ all }` import breaks under Node's native ESM. Bundlers/Bun mask this, so verify with a real Node ESM resolve.
- **Global singletons.** `Config` and `Logger` are stored on `globalThis` so duplicate package copies share one instance. Preserve that pattern.
- **Error exposure.** `toObject()` is full-fidelity (logs/IPC, round-trips via `AppError.from`); `toResponse()` masks internal errors. `from()` fails closed to internal — never loosen that.
- **Git.** Never push to `main`/`master`, force-push, or merge to a remote. Work lands on **local** `main` only unless the user says otherwise.
