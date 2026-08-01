# Monorepo workspace map

Authored 2026-07-31 during the AI-tooling consolidation pass. Note on provenance: none of the
individual polyrepo working copies this monorepo was assembled from (`identity-server`, `identity-web`,
`novel-forge-server`, `novel-forge-web`, `pulse-server`, `pulse-web`, `web-novel-server`, `web-novel-web`,
or any `packages/*` repo) ever had a local `.serena/memories` directory — there was nothing to migrate
into this file. Everything below was verified directly against this repo's current source.

## Layout

- `apps/*` — 8 deployable products (4 backends + 4 web apps), each independently built, imaged, and
  deployed. Apps remain independently deployed even though development now happens in one repo.
- `packages/*` — 8 shared libraries (`app`, `auth`, `class-schema`, `common`, `fastify`, `modules`, `ui`,
  `web`), consumed via `"workspace:*"` — never independently deployed, nothing published to npm. The
  `version` field in each `packages/*/package.json` is a frozen leftover from the pre-monorepo repos and
  means nothing; don't bump it.
- `e2e/` — whole-platform Playwright suite (currently a placeholder). Runs cross-app flows against
  already-deployed service URLs supplied via `E2E_*` environment variables — there is no local compose
  deployment.
- `scripts/` — root tooling: a flat folder of directly-runnable Bun scripts (`build.ts`, `verify.ts`,
  `gen-api-types.ts`, `check-migrations.ts`, plus `workspaces.ts` and `utils/`). NOT a Bun workspace,
  never a dependency. There is no `shadow` CLI. Everything is invoked **from the repo root by path**:
  `bun scripts/verify.ts <workspace>`, `bun scripts/build.ts <workspace>`. Workspaces have no
  `build`/`verify` scripts of their own.

## Package names (not all match the directory name)

| Workspace | package.json `name` | inferred build `type` |
| --- | --- | --- |
| `apps/identity-server` | `@shadow-library/identity` (not `-server`) | `backend` |
| `apps/identity-web` | `identity-web` (unscoped) | `ssr` |
| `apps/novel-forge-server` | `@shadow-library/novel-forge-server` | `backend` |
| `apps/novel-forge-web` | `novel-forge-web` (unscoped) | `ssr` |
| `apps/pulse-server` | `@shadow-library/pulse-server` | `backend` |
| `apps/pulse-web` | `pulse-web` (unscoped) | `spa` — the only client-rendered web app; the other three are SSR |
| `apps/web-novel-server` | `@shadow-library/web-novel-server` | `backend` |
| `apps/web-novel-web` | `web-novel-web` (unscoped) | `ssr` |
| `packages/*` | `@shadow-library/<dirname>` | `library`, except `packages/ui` which is `component` |

Naming pattern: every backend server is `@shadow-library/*`-scoped; every web app is unscoped. Backend
scoped names don't reliably match the directory (`identity-server` dir → `@shadow-library/identity`
package name — watch for this when grepping `package.json` by name).

**Web Novel naming split:** the workspace/package names use the hyphenated `web-novel-*` form, but
runtime identifiers still use the older unhyphenated `webnovel` form — `APP_NAME = 'webnovel-server'`,
OAuth scope `webnovel:publish`, dev DB `shadow_webnovel`, client-side storage/cache-key prefix
`webnovel`. That naming is owned by devops; it's not a bug to fix.

## Dependency order

Backend: `common` → `class-schema`/`app` → `fastify` → `modules` (+ `auth` for every backend except
`identity-server`, which *is* the identity provider `auth` talks to). Web: `ui` (always) + `web`
(transport/router/SSR/PWA).

## Per-workspace config reality

- `.shadowrc.json` is **gone** — deleted from every workspace, and the format no longer exists. The build
  type and most build inputs are inferred (path, dependencies, `package.json` `exports`); the handful
  that can't be inferred live in a `"shadow"` key inside the workspace's own `package.json`. Only
  `apps/{identity,novel-forge,pulse,web-novel}-server`, `apps/web-novel-web`, and `packages/ui` carry
  one.
- `eslint.config.ts` exists at the repo root (exporting a `createConfig` factory) **and** in each
  workspace that genuinely deviates: `apps/*` (all 8) plus `packages/{fastify,ui,web}`. A per-workspace
  eslint config is now the correct place for a lint deviation — the opposite of the pre-refactor rule.
- `.prettierrc.json` (plus `.prettierignore`) and `commitlint.config.ts` exist **only at the repo root**
  — no workspace has its own copy. `verify.ts` runs prettier from the repo root so the root config and
  ignore files always apply.
- Most per-workspace `.gitignore` files were consolidated into the root `.gitignore`. tsconfig now has a
  three-tier hierarchy: root `tsconfig.base.json` ← family files (`apps/tsconfig.server.json` for the 4
  backends, `apps/tsconfig.web.json` for the 4 web apps, `packages/tsconfig.lib.json` for the `@lib/*`-
  style packages) ← per-workspace leaf, with real deltas layered where they exist. Family files use TS
  5.5+'s `${configDir}` template variable for `include` only (safe — only `tsc` reads it); `paths` stays
  declared per-leaf, plain `./`-relative, because Bun's runtime resolver does not implement `${configDir}`
  correctly across a multi-level `extends` chain (it substitutes the declaring file's own directory, not
  the leaf's — confirmed breaking `bun test`/`bun run` alias resolution when tried). Root
  `tsconfig.web.json`/`tsconfig.build.base.json` were moved to `apps/tsconfig.web.json`/
  `packages/tsconfig.build.json` respectively as part of that split.
- Husky hooks (`.husky/pre-commit`, `.husky/commit-msg`) live once at the repo root and fan out per
  affected target (see `tooling-and-ci-wiring.md`).
