# scripts/

Root tooling for the monorepo. Not a workspace, not a package, not published — just a folder of
directly-runnable Bun scripts, always invoked from the repository root by path.

```
scripts/
  build.ts             bun scripts/build.ts [workspace | glob | --all] [--deps]
  verify.ts            bun scripts/verify.ts [workspace | scripts | --all] [--fix] [--fast]
  gen-api-types.ts     bun scripts/gen-api-types.ts <workspace> [url]
  check-migrations.ts  bun scripts/check-migrations.ts <workspace>
  workspaces.ts        workspace discovery, type inference, topological sort
  utils/               errors, logger, package.json reading, process spawning
```

A `workspace` argument is either its repo-relative directory (`packages/common`) or its package name
(`@shadow-library/common`). Every entrypoint parses its own argv and sets `process.exitCode`; there is no
shared CLI and no `bin/`. Only the four command files are meant to be run — `workspaces.ts` and `utils/`
are library modules the others import.

```sh
bun scripts/verify.ts --all
bun scripts/verify.ts packages/common --fix
bun scripts/verify.ts scripts                     # the tooling itself
bun scripts/build.ts --all
bun scripts/build.ts apps/identity-server
bun scripts/build.ts apps/identity-server --deps  # just its dependency closure
bun scripts/build.ts 'packages/*'                 # every workspace matching a glob
bun scripts/gen-api-types.ts apps/pulse-web
bun scripts/check-migrations.ts apps/identity-server
```

`verify.ts` also accepts `scripts` as a target, covering this folder and the root-level configs — so the
tooling that verifies everything else is not itself the one unverified thing. `--all` includes it.

`build.ts --all` sorts workspaces into dependency levels and builds each level in parallel, replacing the
ordering `bun run --filter` used to provide. `--deps` builds only a workspace's transitive `workspace:*`
closure — the dependency-closure selector `--filter` has no equivalent for, and what CI uses to prepare a
single workspace without building the repo. A glob target (`'packages/*'`) builds every matching
workspace in dependency order, which is what the Docker build uses.

## Conventions over configuration

There is no config file. `workspaces.ts` discovers every workspace from the root `package.json`
`workspaces` globs and derives everything it can from the workspace's path, dependencies, and
`package.json`.

| Fact                           | Where it comes from                                                                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type                           | `apps/*-server` → `backend`; `apps/*-web` → `ssr` when `@tanstack/react-start` is a dependency, else `spa`; a package that exports a stylesheet → `component`; any other `packages/*` → `library`; anything else (`e2e`) → `none` |
| Build exports                  | the workspace `package.json` `exports` field, with the `./dist/` prefix and `.js`/`.d.ts` extension stripped — so the published contract and the build can never drift                                                            |
| Output directory               | `dist/`                                                                                                                                                                                                                           |
| Backend entrypoint             | `src/main.ts`                                                                                                                                                                                                                     |
| Migrations directory           | `generated/drizzle`                                                                                                                                                                                                               |
| Generated API types            | `src/lib/apis/api-types.gen.ts`                                                                                                                                                                                                   |
| Lint rules, ignores, overrides | the root `eslint.config.ts` and each workspace's own `eslint.config.ts`                                                                                                                                                           |
| Format rules and ignores       | the root `.prettierrc.json`, `.gitignore`, and `.prettierignore`                                                                                                                                                                  |
| Commit message rules           | the root `commitlint.config.ts`                                                                                                                                                                                                   |
| Whether `verify` runs tests    | false for web apps and `none`-type workspaces, true otherwise                                                                                                                                                                     |

## The `"shadow"` package.json key

Only for the handful of build inputs that genuinely cannot be inferred. A workspace with nothing
non-derivable carries no `"shadow"` key at all.

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

## What each script does

### `build.ts`

Dispatches on the workspace type:

- **`library`** — `tsc` + `tsc-alias` into a flat `dist/`, then synthesizes `dist/package.json`
  (`main`/`module`/`types`/`exports`/`typesVersions`, rewritten `sideEffects`, optional `bin`) and copies
  README/LICENSE.
- **`component`** — Rollup + esbuild + PostCSS (CSS Modules with scoped names, one extracted stylesheet,
  `'use client'` banners) for the JS and CSS, `tsc --emitDeclarationOnly` for the types, then CSS-import
  stripping from the `.d.ts` files and an optional `@layer` stylesheet variant.
- **`backend`** — one tree-shaken `Bun.build` bundle per entrypoint. Identifier minification stays off
  because `reflect-metadata` DI resolves classes and parameters by name. Writes a trimmed
  `dist/package.json` carrying the current git commit; no `dependencies`, since everything is inlined.
- **`spa` / `ssr`** — delegates to the workspace's own `vite build`. No `dist/package.json`: it's an app.
- **`none`** — nothing to build.

`--all` groups the workspaces into dependency levels over their `workspace:*` links and builds each level
in parallel, one child process per workspace, replaying their buffered output in a stable order.

### `verify.ts`

Format → lint → type-check → test, stopping at the first failure.

- **format** — the prettier CLI over the workspace directory, run from the repo root so the root
  `.prettierrc.json`, `.gitignore`, and `.prettierignore` all apply. `--fix` writes instead of checking.
- **lint** — ESLint with no explicit config and the workspace as its cwd, so flat config's own upward
  lookup finds the workspace's `eslint.config.ts` when it has one and the root config otherwise.
- **type-check** and **test** — the workspace's own package.json scripts.

`--fast` stops after lint (the pre-commit hook's speed budget). `--all` verifies every workspace and
reports a combined list of failures rather than aborting on the first.

### `gen-api-types.ts`

Fetches a running server's OpenAPI document, rewrites colliding operationIds to `method_path`, widens GET
query parameter types to also accept `string` (everything travels as a string through `URLSearchParams`),
generates types with `openapi-typescript`, appends top-level schema and query/path-param aliases, formats
with prettier, and writes atomically to `src/lib/apis/api-types.gen.ts`.

The server↔web contract is **not** atomic — run this deliberately as part of a coordinated server change,
against a locally running server, and commit the regenerated file with the change.

### `check-migrations.ts`

Runs the workspace's `db:generate` and fails if it leaves `generated/drizzle` dirty — a schema change made
without committing the migration it requires. Checks untracked files too, since a genuinely new migration
is a new file `git diff` alone would never flag.

## Conventions inside this folder

Section banner comments, named exports, `kebab-case` filenames, two-space indent, semicolons, 180 columns
— the repository conventions in `AGENTS.md`. Relative imports with explicit `.ts` extensions, no path
aliases. Failures throw `ShadowError`, never a bare `Error`, and `console.*` appears only in
`utils/logger.ts`.
