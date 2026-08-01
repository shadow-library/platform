# Repository setup reference — the root `scripts/` tooling, build, CI

Load this when scaffolding a new workspace or touching build/verify/lint/CI/husky config.

Build and verify for every workspace live in **root tooling, not a package** — `scripts/` is not a Bun
workspace and is never installed as a dependency. It is a flat folder of directly-runnable Bun scripts
(`build.ts`, `verify.ts`, `gen-api-types.ts`, `check-migrations.ts`, plus `workspaces.ts` and `utils/`),
**always invoked from the repository root by path**. There is no `shadow` CLI and no `.shadowrc.json`;
both were retired. Workspaces carry **no** `build`, `verify`, `check-migrations`, or `generate:api-types`
scripts — `cd <workspace> && bun run verify` does not work. MUST NOT hand-roll a workspace
`scripts/build.ts`, `scripts/lint.ts`, `commitlint.config.*`, `eslint.config.ts`, or husky hook bodies.
Lint deviations belong in the root `eslint.config.ts` as a `files`-scoped block (see "Lint config" below)
— that is real ESLint flat config, not bespoke tooling config. **`.prettierrc.json` and
`commitlint.config.ts` live once, at the repo
root** — prettier resolves its config via its own upward directory search, and `verify.ts` runs the
prettier CLI from the repo root so the root `.prettierrc.json`, `.gitignore`, and `.prettierignore` all
apply. MUST NOT add a workspace-local `.prettierrc.json`; it would silently start shadowing the root one
for that workspace only. The toolchain (`typescript` 6.x, `tsc-alias`, `eslint` 10, `prettier`,
`eslint-plugin-perfectionist`, `@commitlint/cli`, `husky`, …) is a root `devDependency` — workspaces
don't pin any of it. Engines: node >= 23.

## Setup — scaffolding a new workspace

A new workspace needs only `package.json`, a `tsconfig.json`, and source (AGENTS.md). The `tsconfig.json`
extends the nearest family file, not the root base directly: backends extend `../tsconfig.server.json`,
web apps `../tsconfig.web.json` (both under `apps/`), `@lib/*`-style library packages
`../tsconfig.lib.json` (under `packages/`) — each family file extends the root `tsconfig.base.json` in
turn via TS 5.5+'s `${configDir}` template variable, which resolves an `include` entry declared in the
family file against the *extending* workspace's own directory. `paths` is deliberately **not** hoisted
into the family files, even though `tsc` itself resolves a `${configDir}`-based `paths` correctly through
the two-level chain: Bun's runtime resolver (`bun test`, `bun run`) does not implement `${configDir}`
correctly across `extends` — it substitutes the *declaring* file's own directory rather than the leaf's,
silently breaking every alias (confirmed by hitting exactly this with `apps/tsconfig.server.json` — see
its comment). Every workspace therefore still declares its own `paths` in its own `tsconfig.json`, plain
`./`-relative, same as before this split. A workspace whose per-app deltas are otherwise fully covered by
its family file needs only `{ "extends": "../tsconfig.server.json", "compilerOptions": { "paths": {...} } }`
(or the `web.json`/`lib.json` equivalent); a genuine per-workspace `include`/`types` delta layers on top of
that. `packages/ui` and `packages/web` diverge enough (DOM/storybook/vitest layer; the react layer) to
extend `../tsconfig.base.json` directly instead of the lib family file. Its `package.json` `scripts` carry
only what is genuinely its own — `dev`, and (for a backend/library with a real dev loop) similar
run-mode entries. MUST NOT add a `type-check` script (`tsc`/`tsc -p tsconfig.json`/`tsc --noEmit` are all
identical restatements of what `verify.ts` already runs directly against the workspace's own tsconfig — see
"What each script does" below), a `db:*` pointer script (`scripts/db.ts <workspace> <cmd>` from the repo
root replaces it), a `clean` script, or a `test` script that is a bare `"bun test"` pass-through (`verify.ts`
falls back to running `bun test` directly when the workspace declares no `test` script — only add one if the
workspace's tests genuinely need something other than plain `bun test`, e.g. Playwright, `vitest`, or a
composed sequence):

```jsonc
{ "scripts": { "dev": "bun run --watch src/main.ts" } }
```

There is no scaffolding command — `shadow init` is gone. Wiring is by convention: put the workspace under
`apps/*` or `packages/*` following the naming rules in the type table below, and `scripts/workspaces.ts`
discovers it from the root `package.json` `workspaces` globs on the next run. Add a `"shadow"` key only
for the build inputs that genuinely can't be inferred (next section); no workspace-local `eslint.config.ts`
(a lint deviation is a `files`-scoped block in the root config, see "Lint config" below) and no husky
hooks at all — husky lives once, at the repo
root (`"prepare": "husky"` in the root `package.json`; `.husky/pre-commit` and `.husky/commit-msg` are
committed there and already fan out per-workspace, see below).

**Prerequisites:** `tsconfig.build.json` extending both the workspace's own `tsconfig.json` and
`packages/tsconfig.build.json` (`noEmit: false`, `declaration: true`, `removeComments: true` — the shared
boolean options; path-valued fields like `rootDir`/`include`/`exclude` stay in the workspace's own file,
since TS resolves `extends`-inherited *relative* paths against the file that declares them, not the
extender — this is exactly why the family file's `include` entries use the `${configDir}` template
variable instead of a bare `./`; `paths` stays leaf-local for the Bun-compatibility reason above). A
workspace whose emit shape is fully covered by the base needs only a one-liner `{ "extends":
["./tsconfig.json", "../tsconfig.build.json"], "tsc-alias": { "resolveFullPaths": true } }`; a genuine
delta (e.g. `packages/ui`'s declaration-only component build) still layers its own
`compilerOptions`/`include`/`exclude`. GOTCHA: `paths` (and `include`) replace wholesale on `extends` —
they do not merge key-by-key with the family file's — so a leaf that declares its own `paths` (e.g. a
package's `@shadow-library/<name>` self-name mapping) must repeat any family-file alias it still uses
(e.g. `@lib/*`) alongside it, or lose that alias silently. The shared `bun:test` `Expect<T>` augmentation
lives once at root `types/bun-test.d.ts`, wired into every workspace via `tsconfig.base.json`'s `files` —
no per-workspace `tests/test.d.ts` copy needed. Base `tsconfig.json` on `module: ESNext` +
`moduleResolution: bundler`. TypeScript itself is a root devDependency — workspaces don't pin their own copy.

## Convention first, then the `"shadow"` package.json key

There is no per-workspace tooling config file. `scripts/workspaces.ts` derives everything it can from the
workspace's path, dependencies, and `package.json`:

| Fact                         | Where it comes from                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type                         | `apps/*-server` → `backend`; `apps/*-web` → `ssr` when `@tanstack/react-start` is a dependency, else `spa`; a package that exports a stylesheet → `component`; any other `packages/*` → `library`; anything else (`e2e`) → `none` |
| Build exports                | the workspace `package.json` `exports` field, with the `./dist/` prefix and `.js`/`.d.ts` extension stripped — the published contract and the build can never drift                                                               |
| Output directory             | `dist/`                                                                                                                                                                                                                           |
| Backend entrypoint           | `src/main.ts`                                                                                                                                                                                                                     |
| Migrations directory         | `generated/drizzle`                                                                                                                                                                                                               |
| Generated API types          | `src/lib/apis/api-types.gen.ts`                                                                                                                                                                                                   |
| Lint rules/ignores/overrides | the single root `eslint.config.ts` — every workspace deviation is a `files`-scoped block there                                                                                                                                   |
| Format rules and ignores     | the root `.prettierrc.json`, `.gitignore`, `.prettierignore`                                                                                                                                                                      |
| Commit message rules         | the root `commitlint.config.ts`                                                                                                                                                                                                   |
| Whether `verify` runs tests  | false for web apps and `none`-type workspaces, true otherwise                                                                                                                                                                     |

Only what genuinely cannot be inferred goes in a `"shadow"` key in the workspace's **own
`package.json`**. A workspace with nothing non-derivable carries no `"shadow"` key at all — which is most
of them (`packages/{app,auth,class-schema,common,fastify,modules,web}`, `apps/{identity,novel-forge,pulse}-web`,
`e2e`).

```jsonc
// apps/identity-server/package.json
"shadow": {
  "entries": ["src/worker.ts", "src/migrate.ts"],
  "assets": ["generated/drizzle", "public"]
}
```

| Key          | Applies to                           | Meaning                                                                                      |
| ------------ | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `type`       | any                                  | Overrides the inferred type — for a workspace whose path breaks the naming convention        |
| `entries`    | `backend`                            | Extra entrypoints bundled alongside `src/main.ts`, each emitted standalone                   |
| `assets`     | `backend`                            | Files/dirs copied verbatim into `dist/` (README and LICENSE are always copied)               |
| `command`    | `library`, `component`, `spa`, `ssr` | A bundler invocation replacing the default compile step; must emit into `dist/`              |
| `alias`      | `component`                          | Import prefix → workspace-relative dir for the Rollup bundle, mirroring the tsconfig `paths` |
| `css`        | `component`                          | CSS Modules options: `scopedName`, `extract`, `layer`, `minify`, `useClient`                 |
| `bin`        | `library`                            | Binary name → source-relative base; emitted into `dist/package.json` with a `bun` shebang    |
| `verifyTest` | any                                  | Opts a workspace into or out of the `test` step during `verify`                              |

There is **no `release` key** — release/publish tooling was retired with the migration to this
monorepo; nothing here is published to npm. There are no format options either — prettier options live
in the repo-root `.prettierrc.json` only (see above).

## Lint config — one root file, no workspace-local configs

Lint is real ESLint flat config, not tooling config, but it lives in **one file**: the root
`eslint.config.ts`. It exports a `createConfig` factory holding the base (`@eslint/js` recommended +
typescript-eslint strict/stylistic + perfectionist import sorting + `eslint-plugin-n`, with the
React/hooks/a11y layer, globals, and test-file overrides) and the default export layers every workspace's
deviation on top as a `files`-scoped block, grouped by concern (e.g. one block covers `no-namespace: off`
for every backend; one block covers the SSR web apps' extra Node globals). `verify.ts` runs ESLint with no
explicit `--config` and the workspace as cwd; flat config's upward resolution walks up from there and
finds this one file — there is no workspace-local `eslint.config.ts` to shadow it.

**MUST NOT add a workspace-local `eslint.config.ts`.** This repo tried the opposite convention (a
per-workspace file importing the root `createConfig`) and inverted back: nearly every per-workspace file
turned out to be either dead (an override for a glob that no longer existed) or a duplicate of what the
root already provided via its own scoped blocks (e.g. the web apps' React/JSX layer). A workspace lint
deviation is a `files`-scoped block appended to the root config's default export, not a new file. One
subtlety if you add one: the root config's own file-scoped patterns (e.g. its test-file relaxations) must
be written with a leading `**/` so they match at any workspace depth — a bare `tests/**/*.ts` only matches
a `tests/` directory directly under the repo root now that there is a single config file resolving every
workspace's files.

## Workspace `type` decision table

| `type`                               | `build.ts` does                                                                                            | Lint globals default                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `library` (default for `packages/*`) | `tsc` + `tsc-alias` (or a `"shadow".command`) → flat `dist/` package with synthesized `dist/package.json`  | node (`"both"` for hybrid client+server libs, `"browser"` for browser-only) |
| `component`                          | Rollup + PostCSS → CSS-Modules React library (`.js` + one extracted `styles.css`, `.d.ts`, `'use client'`) | both                                                                        |
| `backend`                            | `Bun.build` → single-file tree-shaken `dist/main.js`                                                       | node                                                                        |
| `spa`                                | the workspace's `vite build` (client bundle)                                                               | browser                                                                     |
| `ssr`                                | the workspace's `vite build` (SSR server + client, e.g. TanStack Start)                                    | both                                                                        |
| `none`                               | nothing to build (`e2e`)                                                                                   | —                                                                           |

Every `apps/*` workspace here is `backend`, `spa`, or `ssr`; every `packages/*` workspace is `library`
except `packages/ui`, which is `component`. `e2e` infers as `none` — it has nothing to build, and
`build.ts` skips it.

Choosing between `library` and `component`: a **pure-TypeScript React library** (hooks/helpers, no CSS —
e.g. `@shadow-library/web`) is a plain `library`, no bundler. A library shipping **CSS Modules** (e.g.
`@shadow-library/ui`) MUST be `component` (`tsc` can't process `.module.css`) — which is what exporting a
stylesheet from `package.json` `exports` infers. Any other custom bundler → `library` + `"shadow".command`.

**Per-type bundlers:** the Rollup/PostCSS stack (only `component` needs it) is a root devDependency;
`backend` uses Bun's bundler, and `spa`/`ssr` bring their own Vite in the workspace.

**`library` build gotcha:** it fails hard on a non-zero `tsc` exit — a workspace whose `tsc` emits despite
type errors (`noEmitOnError` unset) will fail the build. Fix the types first.

## Commands

Everything runs **from the repository root**, by path. A `<workspace>` argument is either its
repo-relative directory (`packages/common`) or its package name (`@shadow-library/common`).

| Command                                                                  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun scripts/build.ts <workspace>`                                       | Builds per inferred workspace `type` (table above).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `bun scripts/build.ts <workspace> --deps`                                | Builds only that workspace's transitive `workspace:*` dependency closure, in dependency order — what CI uses to prepare a single workspace without building the repo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `bun scripts/build.ts --all`                                             | Sorts every workspace into dependency levels and builds each level in parallel (replacing the ordering `bun run --filter` used to provide). Root `bun run build`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `bun scripts/verify.ts <workspace> [--fix] [--fast]`                     | Prettier (run from the repo root, so the root `.prettierrc.json`/`.gitignore`/`.prettierignore` apply) → ESLint (no explicit config; flat config's upward lookup finds the single root `eslint.config.ts`) → `tsc` run directly against the workspace's own `tsconfig.json` → the workspace's own `test` script if it has one, else `bun test` directly (only for workspaces where `verifyTest` is true). Stops at first failure. `--fast` stops after lint — the pre-commit hook's speed budget. `--fix` applies format/lint fixes in place. No workspace needs a `type-check` package.json script, and only a workspace with a genuinely non-default test command needs a `test` one. |
| `bun scripts/verify.ts scripts`                                          | Verifies the root tooling itself (`scripts/` + the root-level configs) — the thing that verifies everything else isn't the one unverified thing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `bun scripts/verify.ts --all`                                            | Verifies every workspace plus `scripts`, reporting a combined failure list instead of aborting on the first. Root `bun run verify`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `bun scripts/gen-api-types.ts <web-app>\|--all [url] [--check]`          | OpenAPI doc → typed `src/lib/apis/api-types.gen.ts` (unique operationIds `<method>_<path>`, GET query-param widening, `<Name>QueryParams`/`PathParams` aliases; formatted via the root Prettier config). Without `--check`, writes the file — a single target defaults to a locally running server (`url` overrides), `--all` boots each paired server hermetically in-process. With `--check`, nothing is written: it boots the paired server(s) in-process, diffs a fresh render against the committed file, and fails with a nonzero exit and an actionable message on drift — the server↔web contract drift gate CI runs.                                                                     |
| `bun scripts/check-migrations.ts <workspace>`                            | Runs `scripts/db.ts <workspace> generate` directly (in-process, via `db.ts`'s exported `runDbCommand`); fails on uncommitted migrations in `generated/drizzle` (tracked AND untracked).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `bun scripts/db.ts <workspace> generate\|migrate\|create-template\|seed` | The 4 backends' Drizzle/Postgres CLI. No workspace carries its own `drizzle.config.ts` — `generate` shells `drizzle-kit generate` with `--schema`/`--out`/`--dialect` derived from convention (override the schema path via `shadow.db.schema`); `migrate` runs whichever `shadow.entries` item matches `/migrate/i`. `create-template` is a single generic driver here in `scripts/db.ts` — drop+create the template DB, run the migrate entry against it, run the optional template-seed hook (`shadow.db.templateSeed`, or the conventional `tests/fixtures/seed.ts` if present), mark it `IS_TEMPLATE` — no backend carries its own template-build script anymore. `seed` runs that same conventional `tests/fixtures/seed.ts` directly. Per-test-file DB cloning (`createDatabaseFromTemplate`/`dropDatabase`) lives in each backend's own `tests/fixtures/template-db.ts`, imported via `@tests/*`. No workspace carries its own `db:*` package.json scripts — this is the only entry point.                                                                                    |

Commit messages are linted by `@commitlint/cli` against the root `commitlint.config.ts`, wired once at the
repo root in `.husky/commit-msg` (`bunx --bun commitlint --edit "$1"`). There is no tooling command for it.

There is no release command — see "No release tooling" below.

## Build details per type

- **`backend`** — `Bun.build` single file, every JS dep inlined; identifier minification forced OFF so
  `reflect-metadata` DI keeps resolving classes by name. Entry is `src/main.ts` by convention;
  `"shadow".entries` adds extra standalone bundles → `dist/<name>.js` (e.g. a migration runner) and
  `"shadow".assets` lists dirs copied verbatim (e.g. `generated/drizzle`). Writes a trimmed
  `dist/package.json` (runtime metadata + the current git commit, no `dependencies`).
- **`component`** — Rollup (esbuild transpile, `preserveModules`) emits `dist/<module>.js`, deps
  external; PostCSS scopes every `.module.css` (`sh-[local]_[hash:base64:5]` default) and extracts ONE minified
  `styles.css`; `'use client'` banner per module matching `css.useClient` (default `.tsx`);
  `tsc --emitDeclarationOnly` + `tsc-alias` for `.d.ts` (side-effect CSS imports stripped); optional
  `@layer`-wrapped `styles.layer.css` when `css.layer` set. Config under `"shadow".css`
  (`scopedName`/`extract`/`layer`/`minify`/`useClient`) and `"shadow".alias` (mirror tsconfig paths).
  Prereqs: `tsconfig.build.json` with `emitDeclarationOnly` + a `css.d.ts` for `*.module.css`.
- **`spa`/`ssr`** — orchestrates the workspace's own `vite build` (`"shadow".command` to override, as
  `apps/web-novel-web` does). Many hashed chunks is correct here; no `dist/package.json` synthesis.
- **`library`** — ESM-only flat `dist/` with synthesized `dist/package.json`
  (`main`/`module`/`types`/`exports`/`typesVersions`, subpath exports for JS and raw assets like
  `./styles.css`, `sideEffects` rewriting, `bun`-shebang'd bin).

## Container builds (deployable apps)

Every deployable workspace (`backend`, `ssr`) owns a hand-maintained `apps/<name>/Dockerfile` — 8 total,
comment-free by convention, app-specific rather than generated. Each copies **every** workspace manifest
(a `--frozen-lockfile` install fails loudly if any is missing), scopes the install with
`--filter ./apps/<name> --filter ./`, COPYs only the app's own `workspace:*` dependency closure as
source, and builds with the root tooling (`bun scripts/build.ts <app> --deps`, then the app itself).
Every `bun install` line carries a BuildKit cache mount
(`--mount=type=cache,target=/root/.bun/install/cache`), so reinstalls after a manifest change resolve
from the build host's shared download cache instead of the network. Backends produce a dist-only
runtime (`ENTRYPOINT ["bun", "run"]`, `CMD ["main.js"]`, port 8080); ssr apps a production-filtered
`node_modules` runtime that preserves the monorepo layout (port 3000). No HEALTHCHECK and no
health-port EXPOSE — health endpoints are internal-only by design and never internet-exposed. When
editing a Dockerfile, MUST keep it comment-free, closure-only, and structurally parallel to its 7
siblings (the manifest COPY block and `ARG BUN_VERSION` are intentionally identical across all 8 —
a change to one usually means the same change to all).

The build context is always the repo root:

```bash
docker build --build-arg APP_VERSION=$(git rev-parse --short=7 HEAD) -f apps/<name>/Dockerfile .
```

Only backends declare `ARG APP_VERSION` (defaulting to `local`); ssr images take no build args, and
passing one just produces a BuildKit warning. `APP_VERSION` is the **7-character head commit** (with a
`-dirty-<id>` suffix when built from an uncommitted tree). `HttpCoreModule` stamps it into the served
OpenAPI document's `info.version`, making every running image traceable to the exact commit it was
built from. The app reads it through `Config` (never `process.env`), and it MUST NOT be hand-set in
`.env` files — it is build metadata, not configuration. In practice you rarely run `docker build` by
hand: `gitops build` (next section) derives the tag and version and passes the argument itself.

## Local deployment — the `gitops` CLI

Deployment is owned by the separate `devops` repository (a Go CLI installed on PATH as `gitops`); this
monorepo only guarantees each app's Dockerfile builds a deploy-ready image. `gitops` reads this
checkout as its image source via `PLATFORM_ROOT`, which defaults to the `platform/` sibling of the
devops checkout. The local dev environment is a k3d cluster serving
`https://<service>.shadow-apps.test` (dnsmasq loopback DNS + mkcert wildcard TLS) — the same URLs the
root `e2e/` suite defaults to when its `E2E_*` vars are unset, so a green local deploy is directly
e2e-testable with `cd e2e && bun run test`.

- **Bootstrap / repair:** `gitops up dev` — cluster → dns → tls → secrets → apply, in that order;
  every step is idempotent, so re-running it is the normal way to fix a half-built environment.
- **Inner loop (code → running pod):** `gitops build <app>... --no-commit --deploy`, e.g.
  `gitops build identity-server --no-commit --deploy`. It builds the selected images from this repo's
  **working tree** (uncommitted changes included — the tag becomes `sha-<head>-dirty-<id>` so the
  Deployment spec always moves), pushes them to the shared local registry, pins `image.tag` in each
  component's `values-dev.yaml`, and Helm-upgrades exactly those components.
- Selectors are `<service>-<component>` names (`identity-server`, `identity-web`); no selector builds
  every component. `--jobs <n>` raises build concurrency after the first image (default 3 — the first
  build runs alone to populate the shared Bun download cache the others mount).
- `gitops apply dev [service|component...]` re-deploys from the devops working tree without
  rebuilding; `gitops status dev` reports cluster/release/pod health; `gitops stop dev` / `start dev`
  park and resume the cluster without destroying it.

Images reach prod only through `gitops promote` — never build at prod directly.

## No release tooling

There is no release script. Every `packages/*` here is `private`, internal-only, and consumed by
`apps/*` via `workspace:*` — there is no npm publish step, no dist-tag, no changelog generation, and the
version field in a `packages/*/package.json` is a frozen leftover from before the monorepo migration
(don't bump it, and don't expect it to mean anything). If you're used to the pre-monorepo `shadow
release <level>` workflow from one of these packages' standalone-repo days, it's gone — a breaking
change to a package export is handled per AGENTS.md's "Working across workspaces": fix every first-party
consumer in the same change, not by cutting a new package version for consumers to adopt later.

## CI

A single workflow (`.github/workflows/ci.yml`) replaces the old per-repo publish/test split:

1. **Affected-workspace detection.** A `changes` job diffs against the merge-base and expands the
   changed-file list into affected workspace names: `apps/<x>/**` → that app only; `e2e/**` → `e2e` only;
   anything under `packages/**` (which now includes the `packages/tsconfig.lib.json` /
   `packages/tsconfig.build.json` family files — matched by the same `packages/*` case pattern), `scripts/**`,
   or root config (`package.json`, `bun.lock`, `tsconfig.base.json`, `tsconfig.json`,
   `apps/tsconfig.server.json`, `apps/tsconfig.web.json`, `.prettierrc.json`, `eslint.config.ts`,
   `eslint-plugins.d.ts`, `commitlint.config.ts`, the workflow file itself) → **every** workspace (a
   shared package or the tooling itself can break any consumer). The two `apps/tsconfig.*.json` family
   files are listed explicitly rather than relying on the generic `apps/*` rule: that rule maps a changed
   path to a single app (`cut -d/ -f1,2`), which would silently misroute a family-file change (it affects
   every backend or every web app, not one) — an explicit case arm, checked before the generic `apps/*`
   arm, is the simplest correct fix. Workspaces are enumerated from the filesystem, not a hardcoded list,
   so a new `apps/*`/`packages/*` needs no workflow edit. The list also includes the non-workspace
   `scripts` target, so the root tooling is itself verified.
2. **One `verify` job per affected workspace** (matrix, `fail-fast: false`, capped parallelism), each:
   builds that workspace's dependency closure first (`bun scripts/build.ts <workspace> --deps`),
   optionally checks migrations / creates a template DB for backends that need Postgres, then runs
   `bun scripts/verify.ts <workspace>` and `bun scripts/build.ts <workspace>` — all from the repo root.
   (The `scripts` leg skips both build steps.) Postgres + Redis services run unconditionally on the job
   (they can't be made conditional per matrix leg); a workspace that doesn't need them just never talks
   to those ports.
3. **No separate publish/release workflow.** There is exactly one workflow file.

## GitHub Actions — the per-workspace step shape

If you're wiring a new workspace into the matrix, its steps are just:

```yaml
- run: bun scripts/build.ts ${{ matrix.workspace }} --deps # its workspace:* dependency closure
- run: bun scripts/verify.ts ${{ matrix.workspace }} # format + lint + type-check + test
- run: bun scripts/build.ts ${{ matrix.workspace }}
```

(`test` runs inside `verify` by convention for everything except the web apps and `e2e` —
`identity-web`, `novel-forge-web`, and `pulse-web` carry **no `test` script at all**: their old per-app
Playwright suites were removed, and browser e2e lives solely in the root `e2e/` workspace, which needs a
live deployment and whose `verify` is therefore static-only. `web-novel-web`'s `test` is `vitest run` —
a real jsdom unit suite — so it opts back in with `"shadow": { "verifyTest": true }`. `packages/ui`
verifies its `test` script (`vitest run --project unit`) normally as a `component`; only its separate
`test:stories` script — the Storybook interaction/a11y project — is never invoked by `verify` and stays
out of CI.)
