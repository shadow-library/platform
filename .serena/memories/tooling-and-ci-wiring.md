# Root tooling and CI wiring

Authored 2026-07-31 during the AI-tooling consolidation pass (see provenance note in
`monorepo-workspace-map.md` — no per-repo Serena memories existed to migrate this from; verified
directly against `scripts/`, `.github/workflows/ci.yml`, and `.husky/*` in this repo).

## The root tooling (`scripts/`)

- Root tooling, not a package: `scripts/` is not a Bun workspace, never installed as a dependency. It is
  a flat folder of directly-runnable Bun scripts — `build.ts`, `verify.ts`, `gen-api-types.ts`,
  `check-migrations.ts`, plus the library modules `workspaces.ts` and `utils/`. **There is no `shadow`
  CLI, no `scripts/src/`, no `bin/`, no `scripts/tests/`, and no `scripts/tsconfig.json`** — all removed
  in the scripts refactor. **There is no release command either** — release/publish tooling was retired
  with the monorepo migration; every `packages/*` is private and consumed via `workspace:*`.
- **Everything runs from the repo root, by path.** Workspaces have no `build`/`verify`/
  `check-migrations`/`generate:api-types` scripts of their own; `cd <ws> && bun run verify` does not
  work.
  - `bun scripts/verify.ts <workspace|scripts|--all> [--fix] [--fast]`
  - `bun scripts/build.ts <workspace|--all> [--deps]`
  - `bun scripts/gen-api-types.ts <workspace> [url]`
  - `bun scripts/check-migrations.ts <workspace>`
  - A `<workspace>` is its repo-relative dir (`packages/common`) or its package name
    (`@shadow-library/common`). `scripts` is a valid `verify` target: the root tooling plus the
    root-level configs, included in `--all`. `--deps` builds a workspace's transitive `workspace:*`
    closure (what CI uses); `--all` builds in topologically sorted levels, in parallel per level.
- `verify.ts` order: Prettier CLI (run from the repo root so the root `.prettierrc.json`, `.gitignore`,
  and `.prettierignore` apply) → ESLint with no explicit `--config` and the workspace as cwd (flat
  config's upward lookup picks the workspace's own `eslint.config.ts` if it has one, else the root) →
  the workspace's own `type-check` script → the workspace's own `test` script. Stops at the first
  failure; `--fast` stops after lint (the pre-commit hook's speed budget).
- Whether verify runs `test` is convention: false for `apps/*-web` and `none`-type workspaces (`e2e`),
  true otherwise. `identity-web`, `novel-forge-web`, and `pulse-web` land on the convention (their
  `test` is a Playwright e2e suite needing a live backend). `web-novel-web` overrides it back on with
  `"shadow": { "verifyTest": true }` in its `package.json` (its `test` is `vitest run`, a real jsdom
  unit suite). `packages/ui` runs its `test` (`vitest run --project unit`) in verify as a normal
  package; only its separate `test:stories` script — the Storybook interaction/a11y project — is never
  invoked by `verify`.

## Configuration — convention, not `.shadowrc.json`

`.shadowrc.json` is deleted from every workspace and the format no longer exists. Replacements:

- **Convention** (`scripts/workspaces.ts`): type from path + deps (`apps/*-server` → `backend`;
  `apps/*-web` → `ssr` with a `@tanstack/react-start` dep, else `spa`; a package exporting a stylesheet
  → `component`; other `packages/*` → `library`; anything else → `none`); build exports derived from the
  workspace `package.json` `exports`; `dist/` output; `src/main.ts` backend entry; `generated/drizzle`
  migrations; `src/lib/apis/api-types.gen.ts` generated types.
- **A `"shadow"` key in the workspace's own `package.json`** for the few non-inferable build inputs:
  `type`, `entries`, `assets`, `command`, `alias`, `css`, `bin`, `verifyTest`. Most workspaces have
  none; the ones that do are `apps/{identity,novel-forge,pulse,web-novel}-server`, `apps/web-novel-web`,
  and `packages/ui`.
- **The tools' own config files:** root `eslint.config.ts` (exporting a `createConfig` factory) plus a
  per-workspace `eslint.config.ts` **only where that workspace genuinely deviates** — this inverts the
  old "no per-workspace eslint config" rule; it is now the correct place for lint deviations. Present in
  `apps/{identity-server,identity-web,novel-forge-server,novel-forge-web,pulse-server,pulse-web,web-novel-server,web-novel-web}`
  and `packages/{fastify,ui,web}`. Formatting: root `.prettierrc.json` + `.prettierignore`. Commits:
  root `commitlint.config.ts` + `@commitlint/cli`.
- Root files that came with this: `eslint.config.ts`, `eslint-plugins.d.ts`, `commitlint.config.ts`,
  `tsconfig.json` (the root tooling project), `.prettierignore`. Most per-workspace `.gitignore` files
  were consolidated into the root one. The web-app-shared tsconfig moved from root `tsconfig.web.json` to
  `apps/tsconfig.web.json` (sibling family file `apps/tsconfig.server.json` for the 4 backends); the
  build-only tsconfig moved from root `tsconfig.build.base.json` to `packages/tsconfig.build.json`, and a
  new `packages/tsconfig.lib.json` covers the `@lib/*`-style packages — see `monorepo-workspace-map.md`.
- Root `package.json` scripts: `prepare` (husky), `type-check`, `verify` (= `bun scripts/verify.ts
  --all`), `build` (= `bun scripts/build.ts --all`), `test` (= `bun run --filter '*' test`, the one
  remaining `--filter` use, since workspaces keep their own `test` scripts).

## Husky — root only

`"prepare": "husky"` in the root `package.json` is the only hook activation in the repo. `.husky/pre-commit`
maps staged files to the target(s) they touch (via path patterns: `apps/<x>/**` → `apps/<x>`;
`packages/<x>/**` → `packages/<x>`; `e2e/**` → `e2e`; `scripts/**` and any root-level `.ts`/`.json`/`.md`
file → the `scripts` target) and runs `bun scripts/verify.ts <target> --fast` from the repo root for
each. `.husky/commit-msg` runs `bunx --bun commitlint --edit "$1"` (the `--bun` matters: commitlint's bin
shebang is node, and only under Bun does it load the TypeScript `commitlint.config.ts` natively). No
workspace wires its own husky hooks — don't add one when scaffolding a new workspace.

## CI (`.github/workflows/ci.yml`) — single workflow, no separate publish job

1. A `changes` job diffs against the merge-base and expands the changed files into affected workspace
   names: `apps/<x>/**` → that app only; `e2e/**` → `e2e` only; anything under `packages/**` (also
   matches the `packages/tsconfig.lib.json`/`packages/tsconfig.build.json` family files), `scripts/**`,
   or root config (`package.json`, `bun.lock`, `tsconfig.base.json`, `tsconfig.json`,
   `apps/tsconfig.server.json`, `apps/tsconfig.web.json`, `.prettierrc.json`, `eslint.config.ts`,
   `eslint-plugins.d.ts`, `commitlint.config.ts`, the workflow file itself) → **every** workspace. The two
   `apps/tsconfig.*.json` family-file paths are matched explicitly (checked before the generic `apps/*` →
   single-app rule), since that generic rule would otherwise misroute a family-file change to one app
   instead of every backend/web app. Workspaces are enumerated from the filesystem at run time, not
   hardcoded — a new `apps/*`/`packages/*` needs no workflow edit — plus the non-workspace `scripts`
   target.
2. One `verify` matrix job per affected workspace (`fail-fast: false`, capped parallelism). Each job
   builds that workspace's `workspace:*` dependency closure first (`bun scripts/build.ts <ws> --deps` —
   the dependency-closure selector Bun's `--filter` never offered, so CI no longer has to build every
   package), optionally checks migrations (`bun scripts/check-migrations.ts <ws>`) / creates a template
   DB for backends that need Postgres, then runs `bun scripts/verify.ts <ws>` and
   `bun scripts/build.ts <ws>` — all from the repo root. The `scripts` leg skips both build steps.
3. Postgres + Redis services run unconditionally on the `verify` job (can't be made conditional per
   matrix leg) — a workspace that doesn't need them just never talks to those ports.
4. `bun scripts/verify.ts --all` at the repo root (root `package.json`'s `verify` script) is the
   whole-platform equivalent; `bun scripts/build.ts --all` is its build counterpart, sorting workspaces
   into dependency levels itself rather than relying on Bun's `--filter` ordering.

## No release tooling, anywhere

There is no release script in `scripts/`, no release config anywhere, and no publish workflow file. A
breaking change to a `packages/*` export is
handled by fixing every first-party `apps/*` consumer in the *same* change (see root `AGENTS.md`
§"Working across workspaces") — not by cutting a new package version for consumers to adopt later.
