---
name: shadow-library-ecosystem
description: >-
  Conventions and reusable building blocks for the Shadow Library platform monorepo. Use whenever
  working in `apps/*` or `packages/*` here — backend services (@shadow-library/app + fastify +
  class-schema + modules + common [+ auth]), web frontends (@shadow-library/ui + web), the shared
  packages themselves, and the root build/verify tooling (`scripts/`). Reach for
  ecosystem packages BEFORE hand-rolling DI, config, logging, validation, HTTP routing, caching,
  database access, error handling, UI components, or API transport. Also use when migrating a
  workspace that hand-rolls what the ecosystem provides.
---

# Shadow Library Ecosystem

First-party TypeScript packages that every workspace in this monorepo builds on. Consistency across
apps is the point: the ecosystem already provides DI, config, logging, validation, HTTP wiring,
caching, DB access, error taxonomy, UI components, API transport, and repo tooling. **MUST NOT
re-implement any of these by hand.**

## Activation

**MUST activate** for any task inside this repository's `apps/*` or `packages/*` — that covers every
workspace with a `@shadow-library/*` dependency or an ecosystem package itself. It also applies to
`e2e/` (consumes the deployed apps) and to `scripts/` (builds/verifies every workspace above).

Root-only config/docs work (`AGENTS.md`, `CLAUDE.md`, root `package.json`, CI) does not need this
skill unless it touches workspace conventions directly.

## Required workflow (follow in order, every task)

1. **Detect the workspace type.** The type (`library | component | backend | spa | ssr`) is inferred
   from the workspace's path and dependencies — there is no config file. Read its `package.json` (deps,
   scripts, optional `"shadow"` key) and use the routing table below.
2. **Inspect existing structure.** Open the neighbouring module/feature/component you are about to
   extend and mirror it. Existing workspace code wins over generic patterns when the two conflict in
   style; Non-negotiables below always win.
3. **Load only the relevant references** (routing table). Do not load all of them.
4. **Search `references/api-catalog.md` before creating any utility, helper, wrapper, or component.**
   If a public export covers the need, MUST use it. If a symbol is not listed there, it is not public —
   MUST NOT deep-import it.
5. **Plan** the change: which files, which conventions apply, what the contract impact is — including
   whether it's a breaking change to a `packages/*` export (see AGENTS.md "Working across workspaces":
   fix every first-party consumer in the same change).
6. **Implement incrementally**, keeping each workspace buildable between steps.
7. **Verify:** run `bun scripts/verify.ts <workspace>` **from the repo root** for the changed
   workspace, plus the type-appropriate build/tests (see the post-implementation checklist).
8. **Report deviations** — any convention you could not follow, any verify/test failure you could not
   resolve, any step you skipped. State them explicitly; never imply full verification.

## Reference routing

| You are…                                                                                                | Load                             |
| ------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Writing/changing backend code (controllers, services, DTOs, DB, cache, config, errors)                  | `references/backend.md`          |
| Writing/changing frontend code (UI, routing, transport, PWA, offline, mobile)                           | `references/frontend.md`         |
| Wiring user login, route guards, service-to-service auth, or anything touching identity                 | `references/auth.md`             |
| Writing/changing tests                                                                                  | `references/testing.md`          |
| Authoring a reusable/configurable module (`forRoot`-style, ecosystem package, app-local dynamic module) | `references/library-modules.md`  |
| Touching build/verify/lint/husky config, CI, or scaffolding a new workspace                             | `references/repository-setup.md` |
| Building an app's Docker image, or deploying/testing it on the local k3d cluster (`gitops`)             | `references/repository-setup.md` |
| Adopting the ecosystem in a workspace that hand-rolls things (fully or partially)                       | `references/migration.md`        |
| About to write any new helper/util/component, or unsure what a package exports                          | `references/api-catalog.md`      |

## Workspace map

| Path                                                                                                                                               | Package name                         | Contents                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/identity-server`                                                                                                                             | `@shadow-library/identity`           | Identity: the platform's OIDC provider (`type: backend`)                                                                                                     |
| `apps/identity-web`                                                                                                                                | `identity-web`                       | Identity's web app (`type: ssr`)                                                                                                                             |
| `apps/novel-forge-server`                                                                                                                          | `@shadow-library/novel-forge-server` | Novel Forge: AI-assisted novel authoring (`type: backend`)                                                                                                   |
| `apps/novel-forge-web`                                                                                                                             | `novel-forge-web`                    | Novel Forge's web app (`type: ssr`)                                                                                                                          |
| `apps/pulse-server`                                                                                                                                | `@shadow-library/pulse-server`       | Pulse: notifications and platform activity (`type: backend`)                                                                                                 |
| `apps/pulse-web`                                                                                                                                   | `pulse-web`                          | Pulse's web app (`type: ssr`)                                                                                                                                |
| `apps/web-novel-server`                                                                                                                            | `@shadow-library/web-novel-server`   | Web Novel: the public reading platform's backend (`type: backend`)                                                                                           |
| `apps/web-novel-web`                                                                                                                               | `web-novel-web`                      | Web Novel's web app (`type: ssr`)                                                                                                                            |
| `packages/app`, `packages/auth`, `packages/class-schema`, `packages/common`, `packages/fastify`, `packages/modules`, `packages/ui`, `packages/web` | `@shadow-library/<name>`             | The shared ecosystem packages every app builds on (all `type: library`, except `packages/ui` which is `type: component`)                                     |
| `e2e/`                                                                                                                                             | `e2e`                                | Whole-platform Playwright suite — cross-app flows against deployed service URLs (`E2E_*` vars; defaults to the local `gitops` dev cluster at `https://<service>.shadow-apps.test`) |
| `scripts/`                                                                                                                                         | _(not a workspace)_                  | Root tooling — directly-runnable Bun scripts (`build.ts`, `verify.ts`, `gen-api-types.ts`, `check-migrations.ts`), always invoked from the repo root by path |

**Web Novel naming note:** the workspace/package names use the hyphenated `web-novel-*` form, but the
_runtime_ identifiers — the OIDC app id, the `webnovel:publish` scope, storage/cache key prefixes —
still use the older unhyphenated `webnovel` form internally. That naming is owned by devops; don't
"fix" it to match the workspace name.

**apps/\* vs packages/\* — the rule that matters:** `apps/*` are deployable products (a backend or a
web app), each independently built, imaged, and deployed. `packages/*` are shared libraries consumed
via `workspace:*` — never independently deployed, and nothing in this monorepo is published to npm.
`version` fields in `packages/*/package.json` are frozen leftovers from the pre-monorepo repos and
carry no meaning; do not bump them.

**External deps shared across workspaces come from the root `catalog:` block** (root `package.json`
`catalog`, e.g. `typescript`, `react`, `react-dom`, `fastify`, `drizzle-orm`, `@tanstack/react-*`,
`@types/bun`, `@types/node`, `@types/react*`, `vite`, `@playwright/test`, `ajv`, `light-my-request`,
`type-fest`, `reflect-metadata`). A workspace depending on one of these declares it as `"<pkg>":
"catalog:"` instead of a version string, so every workspace stays on the one pinned version Bun
resolves from the root — check the catalog before adding a version-pinned dep for anything already
listed there.

Backend dependency order: `common` → `class-schema`/`app` → `fastify` → `modules` (a server typically
uses all five, plus `auth` when it verifies tokens or guards routes — every backend does except
`identity-server`, which _is_ the identity provider `auth` talks to). A web app uses `ui` (always) and
`web` (transport/router/SSR/PWA).

## Package map

| Package                        | For                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@shadow-library/common`       | Config, Logger, errors (`AppError`/`ErrorCode`), in-memory caches, Task/Flow orchestration, `APIRequest` HTTP client (+ `svc://` service discovery), utils. Foundation of every backend.                                                                                                                                                                                                         |
| `@shadow-library/app`          | DI container + `@Module`/`@Injectable` + interceptors + lifecycle. The application kernel.                                                                                                                                                                                                                                                                                                       |
| `@shadow-library/class-schema` | `@Schema`/`@Field` DTO classes → JSON Schema. Powers validation & serialization.                                                                                                                                                                                                                                                                                                                 |
| `@shadow-library/fastify`      | Decorator HTTP layer: `@HttpController`, route/param/response decorators, `@Transform`, `ContextService`, `ServerErrorCode`. ESM-only.                                                                                                                                                                                                                                                           |
| `@shadow-library/auth`         | The identity SDK. First-party user login wired end to end by `AuthModule.forRoot()` (login/callback/logout/session/step-up routes, app-session cookie, token cache), offline EdDSA verification (`AuthClient`), route guards (`@Authenticated`/`@RequireScope`/`@RequirePermission`/`@RequireElevation` via `/module`), M2M tokens, PDP checks, test IdP (`/testing`). See `references/auth.md`. |
| `@shadow-library/modules`      | `HttpCoreModule` (helmet/csrf/compress/openapi/health), `DatabaseModule` (Postgres/Drizzle + Redis + Memcached, `run()` + constraint→error map), `CacheModule` (L1+L2, `getOrSet`), pagination DTO builders.                                                                                                                                                                                     |
| `@shadow-library/ui`           | React components + `--sh-*` design tokens + mobile/touch layer. Presentational only.                                                                                                                                                                                                                                                                                                             |
| `@shadow-library/web`          | Frontend wiring: `APIRequest`/`ApiError` transport, `createAppRouter`/`requireAuth`, SSR server fetch, Bun prod server, PWA + service worker + offline subpaths.                                                                                                                                                                                                                                 |

`scripts/` is **not** a package — it's root tooling (never imported, never a `dependency`). Workspaces
carry no `build`/`verify`/`check-migrations`/`generate:api-types` scripts of their own: every one of
those runs from the repo root by path (`bun scripts/verify.ts <workspace>`); see
`references/repository-setup.md`.

## Non-negotiables (apply in every workspace)

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Instead of                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | MUST read env/config via `Config` (`common`); MUST NOT read `process.env` in app code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Only exception: infra scripts that run outside the app (e.g. `scripts/create-template-db.ts`, `src/migrate.ts` — backends have no `drizzle.config.ts`; `scripts/db.ts <workspace> generate` derives schema/out/dialect by convention instead) |
| 2   | MUST log via `Logger.getLogger(namespace, label)`; MUST NOT use `console.*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | winston/pino/bare console                                                                                                                                                                                                                     |
| 3   | MUST throw catalog errors: domain → `ErrorCode` subclass `.create()`/`.throw()`; invariant/infra → `AppError.internal(reason, cause)`; field validation → `ValidationError`; generic HTTP → `ServerErrorCode` (`fastify`)                                                                                                                                                                                                                                                                                                                                                                       | `new Error(...)`, ad-hoc error objects                                                                                                                                                                                                        |
| 4   | MUST NOT import legacy/nonexistent symbols: `InternalError`, `NeverError`, `ServerError`, `APIError`, `HttpErrorCode`, `CloudWatchTransport`, `@Ctx` (removed from `fastify` in its v2 line) — none of these exist in current packages                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                             |
| 5   | MUST wire services via `@Injectable` + `@Module`; MUST NOT `new` a service (outside DI factories)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | manual singletons                                                                                                                                                                                                                             |
| 6   | MUST define request/response shapes as `@Schema`/`@Field` classes in `*.dto.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Zod/Joi/Yup/hand-written JSON Schema, inline DTOs                                                                                                                                                                                             |
| 7   | MUST let `@RespondFor(status, Dto)` serialize responses; MUST NOT hand-build response objects or add `toResponse()` mappers                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                             |
| 8   | MUST use the root tooling (`bun scripts/{build,verify,gen-api-types,check-migrations}.ts <workspace>`, run from the repo root) for build/verify/hooks; MUST NOT add per-workspace `build`/`verify` package.json scripts, a workspace `commitlint.config.*`, husky hooks, or hand-rolled `scripts/*.ts` for these. Lint lives in **one root `eslint.config.ts`** — MUST NOT add a workspace-local `eslint.config.ts`; a lint deviation is a `files`-scoped block in the root config instead. `.prettierrc.json` and `commitlint.config.ts` also live **once, at the repo root**; MUST NOT add workspace-local copies | —                                                                                                                                                                                                                                             |
| 9   | Frontend MUST compose `@shadow-library/ui` + `--sh-*` tokens + CSS Modules; MUST NOT add Tailwind or another styling system                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                             |
| 10  | Frontend MUST use `APIRequest`/`ApiError` (`web`) for API calls; MUST NOT write bespoke fetch wrappers or error types                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                             |
| 11  | Service-to-service calls MUST use `svc://<service>/<path>` URLs via `APIRequest` (`common`); MUST NOT hard-code hostnames                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                             |
| 12  | MUST check `references/api-catalog.md` before adding any utility; MUST NOT duplicate an existing public export                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                             |
| 13  | File/naming/style conventions (banners, kebab-case + role suffix, named exports + barrels, import grouping) MUST match the workspace — see `references/backend.md` §Style                                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                             |
| 14  | User login MUST come from `AuthModule.forRoot()` + `AUTH_*` env vars. Every Shadow app is **first-party**: MUST NOT hand-write a login/callback/logout route, a session cookie, a token cache, or use `RelyingParty` directly. MUST NOT put a token in a cookie — the cookie carries an opaque app-session handle                                                                                                                                                                                                                                                                               | hand-rolled OIDC, `RelyingParty` in a Shadow app, JWT-in-cookie                                                                                                                                                                               |
| 15  | Internal dependencies on other `packages/*` MUST use `workspace:*`; MUST NOT add a pinned version or reach for an npm-published copy — nothing in this monorepo is published                                                                                                                                                                                                                                                                                                                                                                                                                    | a version-pinned or registry-installed internal package dependency                                                                                                                                                                            |

## Which package solves my problem?

| Problem                                                                  | Use                                                                                   | Detail in           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------- |
| Typed config / env var                                                   | `Config` + `ConfigRecords` augmentation                                               | backend.md          |
| Logging                                                                  | `Logger.getLogger(...)`                                                               | backend.md          |
| Domain / infra / validation errors                                       | `ErrorCode` / `AppError.internal` / `ValidationError`; HTTP catalog `ServerErrorCode` | backend.md          |
| User-facing message for a failing input field                            | `@Field({ errorMessage })` (`fastify` contributes it; body/params only)               | backend.md          |
| HTTP endpoint                                                            | `@HttpController` + route/param decorators + `@RespondFor`                            | backend.md          |
| Protect a route / verify tokens / permissions                            | `@shadow-library/auth`: `@Authenticated`/`@RequireScope`/`@RequirePermission`         | auth.md             |
| Log a user in (any Shadow app)                                           | `AuthModule.forRoot()` + `AUTH_*` env — the whole integration; write no login code    | auth.md             |
| Require a stepped-up (AAL2) user                                         | `@RequireElevation()`                                                                 | auth.md             |
| OIDC relying party (third-party/SPA clients only — **not** a Shadow app) | `RelyingParty` (`auth/rp`)                                                            | auth.md             |
| Request-scoped data                                                      | `ContextService` (ambient `Context` pattern)                                          | backend.md          |
| Postgres/Redis/Memcached                                                 | `DatabaseModule` + `DatabaseService.run(...)`                                         | backend.md          |
| Caching                                                                  | `CacheService.getOrSet` (L1+L2); `LRUCache`/`InMemoryStore` for pure in-memory        | backend.md          |
| Helmet/CSRF/compression/OpenAPI/health                                   | `HttpCoreModule.forRoot(...)`                                                         | backend.md          |
| Retry/rollback steps; state machine                                      | `Task`/`TaskManager`; `FlowManager`/`FlowRegistry`                                    | api-catalog.md      |
| Service-to-service HTTP                                                  | `APIRequest` + `svc://` URL                                                           | backend.md          |
| List endpoint pagination                                                 | `PaginationQuery`/`Paginated` DTO builders                                            | backend.md          |
| UI components / theming                                                  | `@shadow-library/ui` + `--sh-*` tokens                                                | frontend.md         |
| Browser → API calls                                                      | `APIRequest`/`call()`/`isApiError` (`web`)                                            | frontend.md         |
| Router / SSR / prod server                                               | `createAppRouter`, `createServerFetch`, `serve`                                       | frontend.md         |
| PWA / service worker / offline data                                      | `web/pwa`, `web/service-worker`, `web/offline`                                        | frontend.md         |
| Mobile/touch screens                                                     | `ui` mobile layer (`data-density="touch"`, `BottomNavigation`, …)                     | frontend.md         |
| Reusable configurable module                                             | `forRoot`/`forRootAsync` + register-pattern config                                    | library-modules.md  |
| Build/verify/CI/scaffold a new workspace                                 | `bun scripts/*.ts` from the repo root + the `"shadow"` package.json key               | repository-setup.md |

## Pre-implementation checklist

Before writing code, confirm ALL of:

- [ ] Workspace type identified (inferred from path + dependencies; see repository-setup.md) and the matching references loaded.
- [ ] The neighbouring module/feature/component this change should mirror has been read.
- [ ] `references/api-catalog.md` searched — no existing export covers what I'm about to write.
- [ ] The change is classified: app code vs. reusable module vs. tooling vs. contract change (a contract
      change ripples to every caller — plan all affected surfaces: routes, DTOs, error codes, generated
      API types, web callers, tests, docs).
- [ ] If the change touches a `packages/*` export and is breaking, every first-party `apps/*` consumer is
      planned into the same change (AGENTS.md "Working across workspaces").
- [ ] No Non-negotiable will be violated by the plan.

## Post-implementation verification checklist

- [ ] `bun scripts/verify.ts <workspace>` passes for every changed workspace (add `--fix` for autofixable
      issues). Run it **from the repo root** — workspaces have no `verify` script. Note: on some
      workspaces verify includes the test suite; on others tests are a separate script — verify runs
      `test` for everything except web apps and `e2e`, unless the workspace's `package.json` `"shadow"`
      key sets `verifyTest`.
- [ ] Type-appropriate build/tests run: backend → `bun test` (+ any workspace DB setup per its CLAUDE.md);
      library/component → `bun scripts/build.ts <workspace>`; spa/ssr → the same build and the app's own
      e2e suite when UI behaviour changed.
- [ ] DB schema changed → migrations regenerated and clean
      (`bun scripts/check-migrations.ts <workspace>`, for backend workspaces).
- [ ] API contract changed → OpenAPI-derived types regenerated in consumers
      (`bun scripts/gen-api-types.ts <web-workspace>`, against a running server) and callers updated.
- [ ] No `console.*`, `process.env`, bare `new Error`, or hand-rolled duplicates introduced.
- [ ] Deviations, skipped steps, and unresolved failures reported explicitly, per workspace.

## References

- `references/backend.md` — canonical backend app structure, controllers/DTOs/errors/config/DB/cache rules.
- `references/auth.md` — integrating with Shadow Identity: first-party login, guards, step-up, M2M,
  identity-side registration, and the landmines that make an integration silently wrong.
- `references/frontend.md` — web app conventions: UI, transport, router/SSR, PWA, offline, mobile.
- `references/testing.md` — test conventions for Shadow workspaces.
- `references/library-modules.md` — patterns for reusable/configurable modules.
- `references/repository-setup.md` — the root `scripts/` tooling, the `"shadow"` package.json key, build types, CI.
- `references/migration.md` — staged adoption for a workspace that hand-rolls what the ecosystem provides.
- `references/api-catalog.md` — the full public API surface of all packages. Search before building.
