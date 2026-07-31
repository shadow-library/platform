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
- `scripts/` — root tooling (the `shadow` CLI). NOT a Bun workspace, never a dependency. Every
  workspace's `package.json` scripts invoke it by relative path: `bun ../../scripts/src/bin/shadow.ts
  <cmd>` from `apps/*`/`packages/*` (two levels deep), `bun ../scripts/src/bin/shadow.ts <cmd>` from
  `e2e/` (one level deep).

## Package names (not all match the directory name)

| Workspace | package.json `name` | `.shadowrc.json` `type` |
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

- `.shadowrc.json` exists in every one of the 16 `apps/*`/`packages/*` workspaces (not `e2e/`, which has
  none and runs on `library` defaults).
- `.prettierrc.json` exists **only at the repo root** — no workspace has its own copy. Prettier resolves
  it via upward directory search; `shadow verify`'s format step reads the same file the same way.
- Husky hooks (`.husky/pre-commit`, `.husky/commit-msg`) live once at the repo root and fan out per
  affected workspace (see `tooling-and-ci-wiring.md`).
