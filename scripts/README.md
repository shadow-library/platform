# @shadow-library/scripts

A deliberately small shared CLI for the Shadow Library ecosystem. It centralizes five workflows that
were duplicated — and had already drifted — across the `shadow-library/*` repositories: the dual
ESM/CJS library build, local pre-commit verification, OpenAPI type generation, the release workflow, and
the migration-drift check. It is **not** a general build tool, a config package, or a CI replacement —
see [What this intentionally does not handle](#what-this-intentionally-does-not-handle).

Binary name: `shadow-scripts`.

## Installation

```bash
bun add -D @shadow-library/scripts
```

## Commands

```text
shadow-scripts build-lib
shadow-scripts verify
shadow-scripts gen-api-types <url> [--out <path>]
shadow-scripts release <bump> [--path <path>]
shadow-scripts check-migrations [--dir <path>]
```

Run `shadow-scripts --help` for a summary. There is no per-command `--help` — this document is the
reference.

### `build-lib`

Cleans `dist/`, compiles the current package to `dist/esm` and `dist/cjs` (`tsc` + `tsc-alias`),
synthesizes `dist/package.json` (`main`/`module`/`types`/`exports`/`typesVersions`, rewritten
`sideEffects` and `bin` paths), and copies `README.md`/`LICENSE` into `dist/` if present.

**Prerequisites:** a `tsconfig.build.json` extending your `tsconfig.json` (`noEmit: false`,
`declaration: true`), and `typescript` + `tsc-alias` as devDependencies (pinned versions — `bunx`
resolves whatever's locally installed, so an unpinned repo gets unpredictable `tsc` behavior).

**Fits:** the tsc + tsc-alias dual-build shape used by `app`, `class-schema`, `common`, `fastify`,
`modules`. **Does not fit** `ui` (Rollup + CSS bundling) or `web` (single ESM `tsc` build with exports
declared directly in the source `package.json`) — those keep their own build scripts.

**Configuration** — a `shadowLibrary.exports` map in `package.json`, keyed by public subpath, valued by
the source-relative base (no extension):

```json
{
  "shadowLibrary": {
    "exports": {
      ".": "index",
      "./errors": "errors/index",
      "./utils": "utils/index"
    }
  }
}
```

Omitting `shadowLibrary.exports` defaults to a single root export (`{ ".": "index" }`). See
[Deviations from ../common](#deviations-from-common) for why this exists instead of hardcoding a
per-package export map the way the original `build.ts` copies did.

A `bin` field (string shorthand or a name→path map, values as source-relative bases like the exports
map) is rewritten into `dist/package.json` with a `./esm/...js` path, a `node` shebang is injected if the
compiled file doesn't already have one, and the file is `chmod 755`'d.

### `verify`

Runs `lint` → `type-check` → `test` from the **consuming repo's** `package.json`, in that order, from
the consuming repo's directory (not this package's). Streams child output. Stops at the first failure
and exits with that command's exit code where practical. Steps whose script doesn't exist are skipped
and reported as skipped — `test` is commonly skipped for library repos that don't define a package.json
`test` script (they run `bun test` only via a release-it hook).

**Recursion guard:** if a repo's `lint`/`type-check`/`test` script itself invokes `shadow-scripts verify`
(directly or via `bunx`/`npx`), that step is skipped with a warning instead of recursing.

**Not a CI replacement.** It exists for local pre-commit use. CI should keep steps granular for
per-step pass/fail visibility in the Actions UI, and several repos interleave service containers or
extra checks (migration drift, Postgres template DB, Playwright reports) between steps that this command
has no model for.

### `gen-api-types <url>`

Fetches an OpenAPI document from `<url>`, rewrites every `operationId` to `${method}_${path}` (unique by
construction — the ecosystem's HTTP framework derives ids from controller method names, which collide
across controllers), widens non-string GET query parameter types to also accept `string` (the client
serializes everything through `URLSearchParams`), runs `openapi-typescript`, appends per-schema type
aliases and `<Name>QueryParams`/`<Name>PathParams` aliases, formats the result with `prettier`, and
writes it out.

**Prerequisites:** `prettier` as a devDependency in the consuming repo (its config is respected).

**Output path:** `src/lib/apis/api-types.gen.ts` by default (the convention all three web repos already
use) — override with `--out <path>` (relative to the repo root).

**Atomicity:** generates into `<output>.tmp`, formats that, and only renames over the real output path on
success — a fetch, validation, generation, or formatting failure leaves any existing file untouched.

### `release <bump> [--path <path>]`

Runs the target package's own `release-it` config for `<bump>` (`patch`, `minor`, `major`, `prepatch`,
`preminor`, `premajor` — the exact set every existing publish workflow's `workflow_dispatch` input
accepts), then re-syncs `package.json` to `main` if — and only if — the target's `.release-it.json` still
sets `git.push: false` (see [Deviations](#deviations-from-common) for why this is conditional).

**Prerequisites:** an existing `.release-it.json` in the target (this command runs it, it does not
scaffold one); `GITHUB_TOKEN` in the environment when the back-sync is needed (expected to be a GitHub
App installation token — see [Deviations](#deviations-from-common)); the `gh` CLI on `PATH`.

`--path` defaults to `process.cwd()`. Validates the target has a `package.json` with a `name` and an
existing `.release-it.json` before running anything. Never prints the token — it's passed to `gh` only
via the environment.

### `check-migrations [--dir <path>]`

Runs the consuming repo's `db:generate` script, then fails if it leaves the migrations directory dirty —
checking both **modified and untracked** files (`git status --porcelain`, not just `git diff`), since a
genuinely new migration is a new file `git diff` alone would never flag (see
[Deviations](#deviations-from-common)).

**Prerequisites:** a `db:generate` script in `package.json` (fails clearly if absent) and a git
repository.

`--dir` defaults to `generated/drizzle` (the convention `identity-server`, `novel-forge-server`, and
`pulse-server` already share) and must resolve inside the repo.

## Configuration summary

| Command | Config source | Key |
|---|---|---|
| `build-lib` | `package.json` | `shadowLibrary.exports`, `bin`, `sideEffects` |
| `verify` | `package.json` | `scripts.lint` / `scripts["type-check"]` or `scripts.typecheck` / `scripts.test` |
| `gen-api-types` | CLI flag | `--out <path>` (default `src/lib/apis/api-types.gen.ts`) |
| `release` | `.release-it.json` | `git.push` (`false` → back-sync runs) |
| `check-migrations` | CLI flag + `package.json` | `--dir <path>` (default `generated/drizzle`), `scripts["db:generate"]` |

## Examples

**Library repo** (`app`, `class-schema`, `common`, `fastify`, `modules`):

```json
{
  "scripts": {
    "build": "shadow-scripts build-lib",
    "verify": "shadow-scripts verify",
    "release": "shadow-scripts release"
  }
}
```

**Web repo** (`identity-web`, `novel-forge-web`, `pulse-web`):

```json
{
  "scripts": {
    "verify": "shadow-scripts verify",
    "generate:api-types": "shadow-scripts gen-api-types http://localhost:8080/dev/api-docs/openapi.json"
  }
}
```

**Server repo** (`identity-server`, `novel-forge-server`, `pulse-server`):

```json
{
  "scripts": {
    "verify": "shadow-scripts verify",
    "check-migrations": "shadow-scripts check-migrations"
  }
}
```

## Failure and exit-code behavior

Every command throws a `ShadowScriptsError` on failure; the CLI entry point catches it, prints the
message (no stack trace) to stderr, and sets the process exit code — `error.exitCode` when the command
set one, otherwise `1`. `verify` additionally propagates the failed step's own exit code when it's a
useful signal (e.g. `3` if a lint script exits `3`). Unexpected (non-`ShadowScriptsError`) failures print
a full stack trace, so a bug in this package itself isn't silently swallowed as a clean one-line message.

## Migration guidance

Migrating a repo onto this package is a **separate, deliberate step per repo** — this package does not
touch sibling repositories, and none were changed as part of building it. Suggested order per repo,
verifying after each step:

1. Add `@shadow-library/scripts` as a devDependency.
2. Replace `bun run scripts/build.ts` with `shadow-scripts build-lib` — first add a `shadowLibrary.exports`
   entry if the repo declares subpath exports (only `modules` currently does, via a `subPathExports`
   array in its own `build.ts` — translate that array into the map shape above).
3. Replace `bun run scripts/lint.ts && bun run tsc && bun test` in `.husky/pre-commit` with
   `shadow-scripts verify`.
4. For web repos, replace `scripts/generate-api-types.ts` with `shadow-scripts gen-api-types <url>`. If a
   repo relied on the `<Name>QueryParams`/`<Name>PathParams` exports (`novel-forge-web`, `pulse-web`
   already do; `identity-web`'s current script doesn't emit them), no source changes are needed — this
   command emits them unconditionally. Diff the generated output once before committing to a CI check.
5. For the 8 repos with a `publish-package.yml`, replace the `Bump version` + `Push changes` steps with a
   single `bunx shadow-scripts release ${{ github.event.inputs.bump }}` call — the GitHub App token
   handoff (`create-github-app-token` → `GITHUB_TOKEN` env) stays exactly as-is in the workflow YAML.
6. For `novel-forge-server`/`pulse-server`, add a `check-migrations` CI step (`identity-server` already
   has the equivalent inline in `code-test.yml`) — this closes the correctness gap called out in the
   feasibility report (schema changes could previously merge without their migration file).

Do all of this as a version bump on each consuming repo, not a blanket find-and-replace — a broken
release in this package now has blast radius across every repo that has migrated.

## What this intentionally does not handle

- **Lint itself.** The ecosystem is mid-migration between ESLint and Biome (`app`, `ui`, `web` use
  Biome; the rest use ESLint) — a unifying `lint` command would paper over that unresolved decision, not
  solve it. `verify` runs whatever `lint` script the repo already defines.
- **A `test` command.** `bun test` is already a one-word wrapper; there's nothing to add.
- **A `clean` command.** `rm -rf dist logs CHANGELOG.md` isn't worth a dependency.
- **A database bootstrap/seed command.** `identity-server`, `novel-forge-server`, and `pulse-server` use
  different ORM drivers (`bun-sql` vs `node-postgres`) and different DI/seeding mechanisms — genuinely
  app-specific, not worth a plugin system for three call sites.
- **A generic server build command.** Server `Bun.build()` entrypoints, client-bundling, and git-commit
  stamping differ per app.
- **A Docker or deployment command.** `devops/gitops` already owns this.
- **Shared ESLint/Biome/TypeScript config packages.** Real duplication (`tsconfig.json`, `biome.json`,
  `eslint.config.js`, `.release-it.json` shape) exists across repos, but the right fix is an `extends`-able
  config package, not a CLI that imposes behavior at execution time.
- **A replacement for complete GitHub Actions workflows.** `codeql.yml` is byte-identical across 11 repos
  and has zero `run:` logic — that's a candidate for a GitHub reusable workflow, a different mechanism
  from this package.
- **Python or mobile-specific tooling.** `code-atlas` (uv/ruff/mypy/pytest) and the Expo apps
  (`memoir-mobile`, `pocket-library`) are a different toolchain entirely.

## Deviations from ../common

Everywhere this package's conventions differ from `../common` (the reference implementation) and why:

- **No `@shadow-library/*` dependency.** Unlike every other package here, this one depends on zero
  `@shadow-library/*` packages. `common` (and eventually every library repo) is itself a consumer of
  `build-lib`/`release` — depending on `common` would create a circular dependency the moment `common`
  migrates onto this package.
- **No `emitDecoratorMetadata`/`experimentalDecorators`, no `reflect-metadata`.** This is a plain CLI
  with no DI container and no decorators, unlike the DI-based libraries `tsconfig.json` was copied from.
- **`shadowLibrary.exports` in `package.json` instead of a hardcoded `subpathBases` object in
  `build.ts`.** The original `build.ts` (byte-identical between `class-schema` and `common`, confirmed by
  the feasibility report) hardcodes each package's subpath export map as TypeScript inside the build
  script — which is exactly why `fastify`'s `sideEffects`-rewriting fix and `successful`-typo fix never
  propagated to the other four copies. A single generic `build-lib` can't hardcode any one package's
  export map, so it moved to explicit `package.json` config instead of guessing from `src/` layout
  (heuristics were explicitly out of scope per the brief).
- **Shebang injected at build time, not written in source.** Rather than relying on `tsc` preserving a
  literal `#!/usr/bin/env node` line across TypeScript versions/module settings (untested previously,
  since no existing library repo ships a `bin`), `build-lib` prepends one to the compiled output if
  missing. This is the first `bin`-shipping package in the ecosystem, so this behavior has no prior art
  to match — it's new, not copied.
- **`verify` accepts `type-check` and `typecheck` as script names.** Every repo but one names the script
  `type-check`; `identity-web` alone uses `typecheck`. `verify` tries both rather than picking a side.
- **`gen-api-types` merges two repos' fixes, not just `identity-web`'s.** `identity-web`'s script has the
  two real bug fixes (unique `operationId`s, GET query param widening) that `novel-forge-web`/`pulse-web`
  lack. But `novel-forge-web`/`pulse-web`'s generated `api-types.gen.ts` is imported directly by their own
  `*.api.ts` files for `<Name>QueryParams`/`<Name>PathParams` types — a feature `identity-web`'s script
  dropped. Porting only `identity-web`'s version, as the feasibility report's suggested command set
  proposed, would regress those two repos on migration. This command keeps both: `identity-web`'s fixes
  plus the named-export generation, with a robustness improvement — the original derives the export name
  from `operation.summary` unconditionally (`pathItem.summary.replaceAll(...)`, which throws if `summary`
  is absent); this version falls back to a name derived from the operationId instead of crashing.
- **`check-migrations` checks untracked files, not just `git diff`.** `identity-server`'s original CI
  step is `git diff --exit-code generated/drizzle`, which only catches modifications to files git already
  tracks — a schema change whose migration is a brand-new file would pass silently. This command uses
  `git status --porcelain` instead, which catches both. This is a fix, not a faithful port, of the
  "one server repository" the brief pointed at.
- **`release` keeps `git.push: false` and the back-sync, but makes it conditional.** Investigated
  dropping the back-sync in favor of authenticated `release-it` pushes (`git.push: true`), as the brief
  asked. Kept `git.push: false` because a GitHub Contents API commit (what the back-sync uses) is shown
  as **Verified** automatically, while a raw `git push` — even with a valid GitHub App token — is not,
  unless the repo also has commit signing configured, which none currently do. Eliminating the back-sync
  today would silently downgrade every release commit from Verified to unverified. Compatibility
  implication: if a repo's `.release-it.json` is changed to `git.push: true` (e.g. once signing is set
  up), `release` detects that and skips the back-sync automatically rather than double-pushing — so this
  is future-compatible with dropping the old model per-repo, without forcing it now. **This is the
  clearest unresolved risk in this package** — see below.
- **Injectable process dependency in `release.ts`.** `release`'s external effects (`release-it`, `git`,
  `gh`) are threaded through an optional `ReleaseDependencies` parameter so tests can exercise the full
  success/failure flow with a fake `run` instead of either skipping coverage of that code or spawning
  real subprocesses. No other command needed this because none of their external calls have
  network/GitHub side effects worth simulating this precisely.

## Unresolved risks

- **The Verified-commit assumption behind `release`'s back-sync is not independently confirmed in this
  environment** — it's based on how GitHub's Contents API and commit verification are documented to
  behave, not a live test against a real `gh api` call with the ecosystem's actual GitHub App. Before
  migrating any repo's `publish-package.yml` onto `shadow-scripts release`, do one real dry run against a
  low-stakes repo and confirm the resulting commit still shows Verified.
- **`build-lib`'s `shadowLibrary.exports` config is new and unused by any real repo yet.** It was
  validated against fixture repos (see `tests/build-lib.integration.spec.ts`), including a case with two
  subpaths and a rewritten path alias, but not against `common`'s actual 9-entry export map or `modules`'
  `subPathExports` array — that only happens when those repos actually migrate.
- **`gen-api-types`'s merged behavior (fixes + named exports) has not been diffed against any of the
  three real repos' actual OpenAPI specs** — only against a small fixture spec in tests. Recommend a
  dry run with `--out` pointed at a scratch file and a manual diff against each repo's current
  `api-types.gen.ts` before wiring it into CI as a diff check.
