# Repository setup reference — the `shadow` CLI, `.shadowrc.json`, build, CI

Load this when scaffolding a new workspace or touching build/verify/CI/husky/`.shadowrc.json`.

Every workspace in this monorepo uses the **`shadow`** CLI for ALL scripting. It is **root tooling, not
a package** — `scripts/` is not a Bun workspace and is never installed as a dependency; every workspace's
`package.json` scripts invoke it by relative path with `bun`. MUST NOT hand-roll `scripts/build.ts`,
`scripts/lint.ts`, `commitlint.config.js`, husky hook bodies, or a per-workspace `eslint.config.js`. The
per-workspace tool config is exactly one file: **`.shadowrc.json`**. **`.prettierrc.json` lives once, at
the repo root** — prettier resolves it via its own upward directory search, and `shadow verify`'s format
step reads the same file the same way (`prettier.resolveConfig`). MUST NOT add a workspace-local
`.prettierrc.json`; it would silently start shadowing the root one for that workspace only. The toolchain
(`typescript` 6.x, `tsc-alias`, `eslint` 10, `prettier`, `eslint-plugin-perfectionist`, `@commitlint/*`,
`husky`, …) is a root `devDependency` — workspaces don't pin any of it. Engines: node >= 23.

## Setup — scaffolding a new workspace

A new workspace needs only `package.json`, a `tsconfig.json` extending the root `tsconfig.base.json`,
and source (AGENTS.md). Wire its scripts to call the CLI by relative path — from `apps/*` or `packages/*`
(two levels deep) that's `../../scripts/src/bin/shadow.ts`; from `e2e/` (one level deep) it's
`../scripts/src/bin/shadow.ts`:

```jsonc
{ "scripts": { "build": "bun ../../scripts/src/bin/shadow.ts build", "verify": "bun ../../scripts/src/bin/shadow.ts verify", "type-check": "tsc" } }
```

`shadow init [--type <library|component|backend|spa|ssr>]` (run from inside the new workspace, e.g.
`bun ../../scripts/src/bin/shadow.ts init --type backend`) drops a starter `.shadowrc.json` for that type
and installs only the build tooling the type needs (only `component` needs any — the Rollup/PostCSS
stack; `backend` uses Bun's bundler, `spa`/`ssr` bring their own Vite). It is idempotent and workspace-
scoped: it does **not** touch `.prettierrc.json` (root already has one — `init` only ever writes one when
none is resolvable, and in this monorepo one always is) and it writes `.husky/*` hooks into whatever
`cwd` it runs from, which is **not what you want inside a workspace** — husky lives once, at the repo
root (`"prepare": "husky"` in the root `package.json`; `.husky/pre-commit` and `.husky/commit-msg` are
committed there and already fan out per-workspace, see below). Run `shadow init` for the `.shadowrc.json`
+ type-dependency scaffolding, then leave hook wiring alone.

**Prerequisites:** `tsconfig.build.json` extending `tsconfig.json` (`noEmit: false`,
`declaration: true`, `rootDir: "src"`); base `tsconfig.json` on `module: ESNext` +
`moduleResolution: bundler`. TypeScript itself ships inside the root tooling — workspaces don't pin
their own copy.

## `.shadowrc.json` — single source of truth per workspace

```jsonc
{
  "type": "library",                                          // library | component | backend | spa | ssr (default library)
  "build": {
    "exports": { ".": "index", "./errors": "errors/index" },  // public subpath → source-relative base (no ext)
    "bin": { "my-cli": "bin/my-cli" },                        // optional; string shorthand also works
    "outDir": "dist"                                          // default
  },
  "verify": {                                                 // everything optional
    "files": { "lint": "src/**/*.{ts,tsx}", "format": "{src,scripts}/**/*.{ts,tsx}" },  // default {src,tests,scripts}/**/*.{ts,tsx}
    "test": false,                                            // skip tests in verify (leave suite to CI)
    "lint":   { "globals": "node", "react": false, "reactVersion": "19.0", "rules": {}, "ignores": [], "overrides": [] },
    "commit": { "extends": ["@commitlint/config-conventional"], "rules": {} }
  },
  "genApiTypes": { "outputPath": "src/lib/apis/api-types.gen.ts" },   // default shown
  "checkMigrations": { "dir": "generated/drizzle" }                   // default shown
}
```

There is **no `release` block** — release/publish tooling was retired with the migration to this
monorepo; nothing here is published to npm. There is also **no `verify.format` field** — prettier
options live in the repo-root `.prettierrc.json` only (see above).

## Workspace `type` decision table

| `type` | `shadow build` does | Lint globals default |
| --- | --- | --- |
| `library` (default) | `tsc` + `tsc-alias` (or `build.command`) → flat `dist/` package with synthesized `dist/package.json` | node (`"both"` for hybrid client+server libs, `"browser"` for browser-only) |
| `component` | Rollup + PostCSS → CSS-Modules React library (`.js` + one extracted `styles.css`, `.d.ts`, `'use client'`) | both |
| `backend` | `Bun.build` → single-file tree-shaken `dist/main.js` | node |
| `spa` | the workspace's `vite build` (client bundle) | browser |
| `ssr` | the workspace's `vite build` (SSR server + client, e.g. TanStack Start) | both |

Every `apps/*` workspace here is `backend`, `spa`, or `ssr`; every `packages/*` workspace is `library`
except `packages/ui`, which is `component`. `e2e` carries no `.shadowrc.json` and runs on the `library`
defaults (it has nothing to build — its `build` script is a no-op).

Choosing between `library` and `component`: a **pure-TypeScript React library** (hooks/helpers, no CSS —
e.g. `@shadow-library/web`) is a plain `type: library`, no bundler. A library shipping **CSS Modules**
(e.g. `@shadow-library/ui`) MUST use `type: component` (`tsc` can't process `.module.css`). Any other
custom bundler → `type: library` + `build.command`.

**Install-at-init:** `shadow init` installs none of the per-type bundlers as its own dependency — it adds
only what the `type` needs to the workspace's own `package.json` (only `component` needs any: the
Rollup/PostCSS stack; `backend` uses Bun's bundler, `spa`/`ssr` bring their own Vite).

**`library` build gotcha:** it fails hard on a non-zero `tsc` exit — a workspace whose `tsc` emits despite
type errors (`noEmitOnError` unset) will fail `shadow build`. Fix the types first.

## Commands

Invoked from inside a workspace via its wired `package.json` script (`bun run verify`, `bun run build`,
…), or directly by path from anywhere (`bun scripts/src/bin/shadow.ts --help` from the repo root for the
full reference).

| Command | What it does |
| --- | --- |
| `shadow init [--type <t>]` | One-time setup for a workspace (idempotent; won't clobber customized hooks or existing configs). |
| `shadow prepare` | Activates husky (`bunx husky`). Wired once at the repo root as the `prepare` script — `shadow prepare` itself is rarely invoked directly. |
| `shadow build [--type <t>]` | Builds per workspace `type` (table above). `--type` overrides config (CI). |
| `shadow verify [--fix] [--fast]` | Prettier (reads the root `.prettierrc.json` via prettier's own upward resolution; warns + falls back to defaults if somehow missing) → ESLint (shipped flat config: `@eslint/js` recommended + typescript-eslint strict/stylistic + perfectionist import sorting + `eslint-plugin-n`; React/hooks/a11y rules auto-enabled from a `react` dep) → delegates `type-check` + `test` to the workspace's own package.json scripts (skip tests via `verify.test: false`, or with `--fast`). Stops at first failure. `--fast` stops after lint — the pre-commit hook's speed budget. `--fix` applies format/lint fixes in place. |
| `shadow commit-msg <file>` | Lints a commit message (config-conventional + `verify.commit` overrides). Wired once at the repo root (`.husky/commit-msg`). |
| `shadow gen-api-types <url> [--out <path>]` | OpenAPI doc → typed `api-types.gen.ts` (unique operationIds `<method>_<path>`, GET query-param widening, `<Name>QueryParams`/`PathParams` aliases; formatted via the root Prettier config). |
| `shadow check-migrations [--dir <path>]` | Requires a `db:generate` script, runs it; fails on uncommitted migrations (tracked AND untracked). Default dir `generated/drizzle`. |

There is no `shadow release` — that command doesn't exist in this CLI; see "No release tooling" below.

## Build details per type

- **`backend`** — `Bun.build` single file, every JS dep inlined; identifier minification forced OFF so
  `reflect-metadata` DI keeps resolving classes by name. Config: `build.entry` (default `src/main.ts`),
  `build.entries` (extra standalone bundles → `dist/<name>.js`, e.g. a migration runner), `build.assets`
  (copied verbatim, e.g. `generated/drizzle`), `build.minify`, `build.target` (`bun`|`node`). Writes a
  trimmed `dist/package.json` (runtime metadata, no `dependencies`).
- **`component`** — Rollup (esbuild transpile, `preserveModules`) emits `dist/<module>.js`, deps
  external; PostCSS scopes every `.module.css` (`sh-[local]_[hash:base64:5]` default) and extracts ONE minified
  `styles.css`; `'use client'` banner per module matching `css.useClient` (default `.tsx`);
  `tsc --emitDeclarationOnly` + `tsc-alias` for `.d.ts` (side-effect CSS imports stripped); optional
  `@layer`-wrapped `styles.layer.css` when `css.layer` set. Config under `build.css`
  (`scopedName`/`extract`/`layer`/`minify`/`useClient`) and `build.alias` (mirror tsconfig paths).
  Prereqs: `tsconfig.build.json` with `emitDeclarationOnly` + a `css.d.ts` for `*.module.css`.
- **`spa`/`ssr`** — orchestrates the workspace's own `vite build` (`build.command` to override). Many
  hashed chunks is correct here; no `dist/package.json` synthesis.
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
is the existing convention for digest-pinning the base image in CI; pass both.) Each app's Dockerfile is
untouched by the monorepo migration and lives in its own `apps/<name>/` directory — apps remain
independently built, imaged, and deployed even though development now happens in one repo.

## No release tooling

`shadow release` doesn't exist. Every `packages/*` here is `private`, internal-only, and consumed by
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
   `tsconfig.base.json`, `.prettierrc.json`, the workflow file itself) → **every** workspace (a shared
   package or the tooling itself can break any consumer). Workspaces are enumerated from the filesystem,
   not a hardcoded list, so a new `apps/*`/`packages/*` needs no workflow edit.
2. **One `verify` job per affected workspace** (matrix, `fail-fast: false`, capped parallelism), each:
   builds `packages/*` first (`bun run --filter './packages/*' build` — `--filter` has no dependency-
   closure selector, but it does respect package dependency order for what it matches, so this is both
   correct and simpler than computing each workspace's transitive closure), optionally checks migrations
   / creates a template DB for backends that need Postgres, then runs `bun run verify` and `bun run
   build` inside that workspace. Postgres + Redis services run unconditionally on the job (they can't be
   made conditional per matrix leg); a workspace that doesn't need them just never talks to those ports.
3. **No separate publish/release workflow.** There is exactly one workflow file.

## GitHub Actions — the per-workspace step shape

If you're wiring a new workspace into the matrix, its steps are just:

```yaml
- run: bun run verify   # shadow verify: format + lint + type-check + test
- run: bun run build    # shadow build
```

(`test` runs inside `verify` unless `.shadowrc.json` sets `verify.test: false` — set on `identity-web`,
`novel-forge-web`, and `pulse-web`, whose `test` script is a Playwright e2e suite needing a live backend,
out of CI's scope for now. `web-novel-web`'s `test` is `vitest run` — a real jsdom unit suite — and it
verifies normally. `packages/ui` also verifies its `test` script (`vitest run --project unit`) normally;
only its separate `test:stories` script — the Storybook interaction/a11y project — is never invoked by
`verify` and stays out of CI.)
