# Repository setup reference — the root `scripts/` tooling, build, CI

Load this when scaffolding a new workspace or touching build/verify/lint/CI/husky config.

Build and verify for every workspace live in **root tooling, not a package** — `scripts/` is not a Bun
workspace and is never installed as a dependency. It is a flat folder of directly-runnable Bun scripts
(`build.ts`, `verify.ts`, `gen-api-types.ts`, `check-migrations.ts`, plus `workspaces.ts` and `utils/`),
**always invoked from the repository root by path**. There is no `shadow` CLI and no `.shadowrc.json`;
both were retired. Workspaces carry **no** `build`, `verify`, `check-migrations`, or `generate:api-types`
scripts — `cd <workspace> && bun run verify` does not work. MUST NOT hand-roll a workspace
`scripts/build.ts`, `scripts/lint.ts`, `commitlint.config.*`, or husky hook bodies. Lint deviations DO
belong in a per-workspace `eslint.config.ts` (see "Lint config" below) — that is real ESLint flat config,
not bespoke tooling config. **`.prettierrc.json` and `commitlint.config.ts` live once, at the repo
root** — prettier resolves its config via its own upward directory search, and `verify.ts` runs the
prettier CLI from the repo root so the root `.prettierrc.json`, `.gitignore`, and `.prettierignore` all
apply. MUST NOT add a workspace-local `.prettierrc.json`; it would silently start shadowing the root one
for that workspace only. The toolchain (`typescript` 6.x, `tsc-alias`, `eslint` 10, `prettier`,
`eslint-plugin-perfectionist`, `@commitlint/cli`, `husky`, …) is a root `devDependency` — workspaces
don't pin any of it. Engines: node >= 23.

## Setup — scaffolding a new workspace

A new workspace needs only `package.json`, a `tsconfig.json` extending the root `tsconfig.base.json`
(web apps extend `tsconfig.web.json` instead), and source (AGENTS.md). Its `package.json` `scripts` carry
only what is genuinely its own — `type-check`, `test`, `dev`, `db:*`:

```jsonc
{ "scripts": { "type-check": "tsc", "test": "bun test" } }
```

There is no scaffolding command — `shadow init` is gone. Wiring is by convention: put the workspace under
`apps/*` or `packages/*` following the naming rules in the type table below, and `scripts/workspaces.ts`
discovers it from the root `package.json` `workspaces` globs on the next run. Add a `"shadow"` key only
for the build inputs that genuinely can't be inferred (next section), an `eslint.config.ts` only if it
genuinely deviates from the root lint config, and no husky hooks at all — husky lives once, at the repo
root (`"prepare": "husky"` in the root `package.json`; `.husky/pre-commit` and `.husky/commit-msg` are
committed there and already fan out per-workspace, see below).

**Prerequisites:** `tsconfig.build.json` extending both the workspace's own `tsconfig.json` and the root
`tsconfig.build.base.json` (`noEmit: false`, `declaration: true`, `removeComments: true` — the shared boolean
options; path-valued fields like `rootDir`/`include`/`exclude` stay in the workspace's own file, since TS
resolves `extends`-inherited paths relative to the file that declares them, not the extender). A workspace
whose emit shape is fully covered by the base needs only a one-liner `{ "extends": ["./tsconfig.json",
"../../tsconfig.build.base.json"], "tsc-alias": { "resolveFullPaths": true } }`; a genuine delta (e.g.
`packages/ui`'s declaration-only component build) still layers its own `compilerOptions`/`include`/`exclude`.
The shared `bun:test` `Expect<T>` augmentation lives once at root `types/bun-test.d.ts`, wired into every
workspace via `tsconfig.base.json`'s `files` — no per-workspace `tests/test.d.ts` copy needed. Base
`tsconfig.json` on `module: ESNext` + `moduleResolution: bundler`. TypeScript itself is a root devDependency — workspaces don't pin
their own copy.

## Convention first, then the `"shadow"` package.json key

There is no per-workspace tooling config file. `scripts/workspaces.ts` derives everything it can from the
workspace's path, dependencies, and `package.json`:

| Fact | Where it comes from |
| --- | --- |
| Type | `apps/*-server` → `backend`; `apps/*-web` → `ssr` when `@tanstack/react-start` is a dependency, else `spa`; a package that exports a stylesheet → `component`; any other `packages/*` → `library`; anything else (`e2e`) → `none` |
| Build exports | the workspace `package.json` `exports` field, with the `./dist/` prefix and `.js`/`.d.ts` extension stripped — the published contract and the build can never drift |
| Output directory | `dist/` |
| Backend entrypoint | `src/main.ts` |
| Migrations directory | `generated/drizzle` |
| Generated API types | `src/lib/apis/api-types.gen.ts` |
| Lint rules/ignores/overrides | the root `eslint.config.ts` plus the workspace's own `eslint.config.ts` where it has one |
| Format rules and ignores | the root `.prettierrc.json`, `.gitignore`, `.prettierignore` |
| Commit message rules | the root `commitlint.config.ts` |
| Whether `verify` runs tests | false for web apps and `none`-type workspaces, true otherwise |

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

| Key | Applies to | Meaning |
| --- | --- | --- |
| `type` | any | Overrides the inferred type — for a workspace whose path breaks the naming convention |
| `entries` | `backend` | Extra entrypoints bundled alongside `src/main.ts`, each emitted standalone |
| `assets` | `backend` | Files/dirs copied verbatim into `dist/` (README and LICENSE are always copied) |
| `command` | `library`, `component`, `spa`, `ssr` | A bundler invocation replacing the default compile step; must emit into `dist/` |
| `alias` | `component` | Import prefix → workspace-relative dir for the Rollup bundle, mirroring the tsconfig `paths` |
| `css` | `component` | CSS Modules options: `scopedName`, `extract`, `layer`, `minify`, `useClient` |
| `bin` | `library` | Binary name → source-relative base; emitted into `dist/package.json` with a `bun` shebang |
| `verifyTest` | any | Opts a workspace into or out of the `test` step during `verify` |

There is **no `release` key** — release/publish tooling was retired with the migration to this
monorepo; nothing here is published to npm. There are no format options either — prettier options live
in the repo-root `.prettierrc.json` only (see above).

## Lint config — the rule that inverted

Lint is now real ESLint flat config, not tooling config. The root `eslint.config.ts` exports a
`createConfig` factory holding the base (`@eslint/js` recommended + typescript-eslint strict/stylistic +
perfectionist import sorting + `eslint-plugin-n`, with the React/hooks/a11y layer and node globals and
test-file overrides). A workspace that genuinely deviates gets its **own `eslint.config.ts`** importing
that base and appending its rules/overrides/ignores. `verify.ts` runs ESLint with no explicit `--config`
and the workspace as cwd, so flat config's upward resolution picks the workspace file when it exists and
the root one otherwise.

This **inverts the old rule**: a per-workspace eslint config used to be forbidden (lint lived in
`.shadowrc.json` `verify.lint`). It is now the correct and only place for a workspace lint deviation.
Workspaces that currently have one: `apps/{identity-server,identity-web,novel-forge-server,novel-forge-web,pulse-server,pulse-web,web-novel-server,web-novel-web}`
and `packages/{fastify,ui,web}`. Everything else inherits the root config — don't add a file that only
re-exports the base.

## Workspace `type` decision table

| `type` | `build.ts` does | Lint globals default |
| --- | --- | --- |
| `library` (default for `packages/*`) | `tsc` + `tsc-alias` (or a `"shadow".command`) → flat `dist/` package with synthesized `dist/package.json` | node (`"both"` for hybrid client+server libs, `"browser"` for browser-only) |
| `component` | Rollup + PostCSS → CSS-Modules React library (`.js` + one extracted `styles.css`, `.d.ts`, `'use client'`) | both |
| `backend` | `Bun.build` → single-file tree-shaken `dist/main.js` | node |
| `spa` | the workspace's `vite build` (client bundle) | browser |
| `ssr` | the workspace's `vite build` (SSR server + client, e.g. TanStack Start) | both |
| `none` | nothing to build (`e2e`) | — |

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

| Command | What it does |
| --- | --- |
| `bun scripts/build.ts <workspace>` | Builds per inferred workspace `type` (table above). |
| `bun scripts/build.ts <workspace> --deps` | Builds only that workspace's transitive `workspace:*` dependency closure, in dependency order — what CI uses to prepare a single workspace without building the repo. |
| `bun scripts/build.ts --all` | Sorts every workspace into dependency levels and builds each level in parallel (replacing the ordering `bun run --filter` used to provide). Root `bun run build`. |
| `bun scripts/verify.ts <workspace> [--fix] [--fast]` | Prettier (run from the repo root, so the root `.prettierrc.json`/`.gitignore`/`.prettierignore` apply) → ESLint (no explicit config; flat config's upward lookup finds the workspace's `eslint.config.ts` or the root one) → the workspace's own `type-check` script → its own `test` script. Stops at first failure. `--fast` stops after lint — the pre-commit hook's speed budget. `--fix` applies format/lint fixes in place. |
| `bun scripts/verify.ts scripts` | Verifies the root tooling itself (`scripts/` + the root-level configs) — the thing that verifies everything else isn't the one unverified thing. |
| `bun scripts/verify.ts --all` | Verifies every workspace plus `scripts`, reporting a combined failure list instead of aborting on the first. Root `bun run verify`. |
| `bun scripts/gen-api-types.ts <workspace> [url]` | OpenAPI doc → typed `src/lib/apis/api-types.gen.ts` (unique operationIds `<method>_<path>`, GET query-param widening, `<Name>QueryParams`/`PathParams` aliases; formatted via the root Prettier config). Defaults to a locally running server. |
| `bun scripts/check-migrations.ts <workspace>` | Requires a `db:generate` script, runs it; fails on uncommitted migrations in `generated/drizzle` (tracked AND untracked). |
| `bun scripts/db.ts <workspace> generate\|migrate\|create-template\|seed` | The 4 backends' Drizzle/Postgres CLI. No workspace carries its own `drizzle.config.ts` — `generate` shells `drizzle-kit generate` with `--schema`/`--out`/`--dialect` derived from convention (override the schema path via `shadow.db.schema`); `migrate` runs whichever `shadow.entries` item matches `/migrate/i`; `create-template`/`seed` run each backend's own `scripts/create-template-db.ts`/`scripts/seed.ts`, which stay backend-owned since their driver choice and seed strategy genuinely differ per backend. Each backend's `db:*` package.json scripts delegate here. |

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

Every deployable workspace (`backend`, `ssr`) builds its Docker image with the app version baked in as a
build argument:

```bash
docker build \
  --build-arg BUN_IMAGE=<digest-pinned base> \
  --build-arg APP_VERSION=$(git rev-parse --short=7 HEAD) \
  .
```

and the Dockerfile carries:

```dockerfile
ARG APP_VERSION=local
ENV APP_VERSION=${APP_VERSION}
```

`APP_VERSION` is the **7-character head commit**. `HttpCoreModule` stamps it into the served OpenAPI
document's `info.version`, and the ecosystem's contract pipeline pulls `openapi.json` from deployed
dev instances to generate SDK/web API types — the stamp is what makes every generated artifact
traceable to the exact server commit it was derived from. An image built without the argument serves
`local` and breaks that audit trail. The app reads the value through `Config` (never `process.env`),
and it MUST NOT be hand-set in `.env` files — it is build metadata, not configuration. (`BUN_IMAGE`
is the existing convention for digest-pinning the base image in CI; pass both.) The per-app
`apps/<name>/Dockerfile` files are gone: one parameterized `docker/Dockerfile` builds every app from the
repo root, selected by `--build-arg APP=<app>` and `--target runtime-{backend,ssr,spa}` — see
`docker/README.md` for the exact invocation per app. Apps remain independently built, imaged, and
deployed even though development now happens in one repo.

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
   anything under `packages/**`, `scripts/**`, or root config (`package.json`, `bun.lock`,
   `tsconfig.base.json`, `tsconfig.json`, `tsconfig.web.json`, `.prettierrc.json`, `eslint.config.ts`,
   `eslint-plugins.d.ts`, `commitlint.config.ts`, the workflow file itself) → **every** workspace (a
   shared package or the tooling itself can break any consumer). Workspaces are enumerated from the
   filesystem, not a hardcoded list, so a new `apps/*`/`packages/*` needs no workflow edit. The list also
   includes the non-workspace `scripts` target, so the root tooling is itself verified.
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
- run: bun scripts/verify.ts ${{ matrix.workspace }}       # format + lint + type-check + test
- run: bun scripts/build.ts ${{ matrix.workspace }}
```

(`test` runs inside `verify` by convention for everything except the web apps and `e2e` — `identity-web`,
`novel-forge-web`, and `pulse-web` have a Playwright e2e `test` script needing a live backend, out of CI's
scope for now. `web-novel-web`'s `test` is `vitest run` — a real jsdom unit suite — so it opts back in with
`"shadow": { "verifyTest": true }`. `packages/ui` verifies its `test` script (`vitest run --project unit`)
normally as a `component`; only its separate `test:stories` script — the Storybook interaction/a11y
project — is never invoked by `verify` and stays out of CI.)
