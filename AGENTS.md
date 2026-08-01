# Shadow Library Platform — Agent Conventions

This file is the cross-agent source of truth for working in this repository. `CLAUDE.md` imports it; other agent tooling should read it directly.

## What this repository is

The Bun-workspaces monorepo for the Shadow Library platform: every first-party application and shared package, developed and verified as one system. The root is configuration and tooling only — it is never a runtime package, and nothing here is published to npm.

## Workspace map

| Path                                                                                                                                               | Contents                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/identity-server`, `apps/identity-web`                                                                                                        | Identity: the platform's OIDC provider and its web app                                                                                                           |
| `apps/novel-forge-server`, `apps/novel-forge-web`                                                                                                  | Novel Forge: AI-assisted novel authoring                                                                                                                         |
| `apps/pulse-server`, `apps/pulse-web`                                                                                                              | Pulse: notifications and platform activity                                                                                                                       |
| `apps/web-novel-server`, `apps/web-novel-web`                                                                                                      | Web Novel: the public reading platform                                                                                                                           |
| `packages/app`, `packages/auth`, `packages/class-schema`, `packages/common`, `packages/fastify`, `packages/modules`, `packages/ui`, `packages/web` | The shared ecosystem packages every app builds on                                                                                                                |
| `e2e/`                                                                                                                                             | Whole-platform Playwright suite — cross-app flows against already-deployed service URLs supplied via `E2E_*` environment variables (no local compose deployment) |
| `scripts/`                                                                                                                                         | Root tooling — directly-runnable Bun scripts (`bun scripts/verify.ts …`), not a workspace                                                                        |

Backend dependency order: `common` → `class-schema`/`app` → `fastify` → `modules` (+ `auth` for non-identity servers). Web apps build on `ui` and `web`.

## Hard rules

- Internal dependencies are `workspace:*`. Nothing is published; there are no release workflows; `version` fields are frozen and carry no meaning.
- A breaking change in `packages/*` must fix all its first-party consumers in the same change — affected-workspace CI and the e2e suite enforce this.
- Per-workspace config files exist only where behavior genuinely differs from the defaults. A new workspace needs only `package.json`, a `tsconfig.json` extending its family file (`apps/tsconfig.server.json`, `apps/tsconfig.web.json`, or `packages/tsconfig.lib.json` — each in turn extending the root `tsconfig.base.json`), and source.
- The server↔web API contract is **not** atomic: each web app's `api-types.gen.ts` is generated from a _running_ server (`generate:api-types` → `http://localhost:8080`). A server contract change requires regenerating consumer types and updating callers as coordinated work. Drift is CI-checked — `bun scripts/gen-api-types.ts <web-app>|--all --check` boots the paired server hermetically (no dev server needed) and fails if a fresh regeneration differs from the committed file.
- Apps remain independently built, imaged, and deployed; the monorepo changes development, not runtime architecture.

## Working across workspaces

- **A breaking change is one change.** If it originates in `packages/*`, fix every first-party `apps/*`
  consumer in the same change — never land the package change and leave callers to a follow-up.
  Affected-workspace CI and the e2e suite both enforce this.
- **The server↔web contract is not atomic.** A server API change requires regenerating the consuming web
  app's `api-types.gen.ts` from a _running_ server and updating its callers as part of the same
  coordinated change (see Hard rules above).

## Validation

Every command runs **from the repo root** — workspaces carry no tooling scripts of their own.

- Single workspace: `bun scripts/verify.ts <workspace>` (format + lint + type-check, plus tests where the workspace opts in). Add `--fix` to apply fixes, `--fast` to stop after lint.
- The root tooling itself: `bun scripts/verify.ts scripts` — covers `scripts/` and the root-level configs.
- Everything: `bun scripts/verify.ts --all`, or `bun run verify`.
- Building: `bun scripts/build.ts <workspace>`, `--deps` for its dependency closure, `--all` for the whole repo in dependency order.
- Whole platform: the `e2e` workspace runs cross-app flows against already-deployed service URLs supplied via environment variables (see `e2e/.env.example`) — there is no local compose deployment in this plan.

## Tooling configuration

Tooling is convention-driven; there is no bespoke config format. A workspace's type is inferred from its
path and dependencies, its build `exports` from its `package.json` `exports` field. Lint rules live in a
single root ESLint flat config, `eslint.config.ts` — there is no per-workspace `eslint.config.ts`; every
workspace deviation (rule overrides, extra globals, file-scoped exceptions) is a `files`-scoped block in
that one file, grouped by concern. Formatting lives in the root `.prettierrc.json`, commit rules in the root
`commitlint.config.ts`. The handful of
build inputs that cannot be inferred — extra backend entrypoints, copied assets, a custom build command,
the component build's alias/CSS options — go in a `"shadow"` key in that workspace's own `package.json`.

## Conventions

- TypeScript strict everywhere; workspace `tsconfig.json` extends its family file — backends `apps/tsconfig.server.json`, web apps `apps/tsconfig.web.json`, `@lib/*`-style packages `packages/tsconfig.lib.json` — which in turn extends the root `tsconfig.base.json`.
- Kebab-case filenames with role suffixes (`*.service.ts`, `*.controller.ts`, `*.dto.ts`, `*.spec.ts`); named exports with barrel `index.ts` files; section banner comments in source files; 2-space indent, semicolons, 180-column width.
- Conventional Commits (`<type>(<scope>): <subject>`, imperative, lowercase).
- Backends compose `@shadow-library/{common,app,class-schema,fastify,modules,auth}`; web apps compose `@shadow-library/{ui,web}`. Reach for the ecosystem packages before hand-rolling DI, config, logging, validation, HTTP, DB access, caching, UI, or transport.
