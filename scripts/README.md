# scripts/

Root tooling for the platform monorepo — the `shadow` CLI (build, local verification, OpenAPI type
generation, and the migration-drift check) plus the commit-message linter, all driven by a workspace's own
`.shadowrc.json`. This directory is **not** a Bun workspace and is never installed as a package: its
dependencies live in the root `package.json`, and every command is invoked by path with `bun`.

## Layout

- `src/bin/shadow.ts` — the CLI entrypoint (`shadow <command>`).
- `src/` — the command implementations (`build.ts`, `verify.ts`, `gen-api-types.ts`, `check-migrations.ts`,
  `commit-msg.ts`, `init.ts`, `prepare.ts`, …) plus `config.ts` (`.shadowrc.json` loading) and `utils/`.
- `scripts/` — this package's own dev scripts (`verify.ts`); dogfoods `shadow verify` against itself.
- `tests/` — `bun:test` specs for everything above, run from the repo root.

## Invoking it

Every workspace (`apps/*`, `packages/*`, `e2e`) wires thin `package.json` scripts that call this by relative
path, e.g. from `apps/identity-server/package.json`:

```json
{ "scripts": { "verify": "bun ../../scripts/src/bin/shadow.ts verify", "build": "bun ../../scripts/src/bin/shadow.ts build" } }
```

Bun resolves the `@lib/*` import alias from `scripts/tsconfig.json` regardless of the caller's working
directory, so this works unmodified from any workspace. Run `bun scripts/src/bin/shadow.ts --help` from the
repo root for the full command reference.

## Commands

```text
shadow init [--type <library|component|backend|spa|ssr>]
shadow prepare
shadow build
shadow verify [--fix] [--fast]
shadow gen-api-types <url> [--out <path>]
shadow check-migrations [--dir <path>]
```

### `build`

Cleans `outDir`, compiles the package with `tsc` + `tsc-alias` (or a `library`/`component` build's own
pipeline), synthesizes `dist/package.json`, and copies `README.md`/`LICENSE` into the output if present.
Dispatches on `.shadowrc.json` `type`: `library`/`component` → a package build; `backend` → a single-file
`Bun.build` bundle; `spa`/`ssr` → the repo's own Vite build. See `src/config.ts` for the full `build` schema.

### `verify [--fix] [--fast]`

Runs, in order, stopping at the first failure: **format** (Prettier, reading the root `.prettierrc.json` via
prettier's own upward config resolution) → **lint** (ESLint with the flat config `src/eslint-config.ts`
ships, layered with `.shadowrc.json` `verify.lint` overrides) → **type-check** (the workspace's own
`type-check`/`typecheck` script) → **test** (the workspace's own `test` script). `--fix` applies
format/lint fixes in place. `--fast` stops after lint — the root pre-commit hook's speed budget.

### `prepare`

The `prepare`-lifecycle hook wired once at the repo root (`"prepare": "husky"` there now owns hook
activation directly; this command remains for parity with `shadow init`-scaffolded repos and tolerates a
not-yet-`git init`ed directory).

### `gen-api-types <url>`

Fetches an OpenAPI document, rewrites every `operationId` to `${method}_${path}`, widens non-string GET
query parameter types to also accept `string`, runs `openapi-typescript`, appends per-schema and
`<Name>QueryParams`/`<Name>PathParams` aliases, formats with the root Prettier config, and writes the result
atomically. Output path defaults to `.shadowrc.json` `genApiTypes.outputPath`; override with `--out <path>`.

### `check-migrations [--dir <path>]`

Runs the workspace's `db:generate` script, then fails if it leaves the migrations directory dirty (checked
via `git status --porcelain`, so a brand-new untracked migration is caught too, not just a diff).

## Configuration — `.shadowrc.json`

Unchanged from before the monorepo migration: one optional file per workspace, layered over the defaults in
`src/config.ts`. `type` genuinely differs per workspace (`library`, `component`, `backend`, `spa`, `ssr`);
`build`/`verify`/`genApiTypes`/`checkMigrations` blocks hold each workspace's real deltas. There is no
`release` block anymore — release/publish tooling was retired with the migration to this monorepo, since
nothing here is published.

## Commit-message linting

`src/commit-msg.ts` lints against `@commitlint/config-conventional` (plus any `.shadowrc.json`
`verify.commit` override), run programmatically so no workspace needs its own `commitlint.config.js`. The
root `.husky/commit-msg` hook drives it: `bun scripts/src/bin/shadow.ts commit-msg "$1"`.

## Testing this directory

`bun test scripts/tests` from the repo root (also wired as the root `test:tooling` script). `scripts/tsconfig.json`
extends the root `tsconfig.base.json` and adds only the `@lib/*` path alias — kept for editor support and
`tsc --noEmit` type-checking, since this directory ships no build output of its own.
