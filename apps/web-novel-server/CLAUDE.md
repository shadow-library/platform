# web-novel-server

The backend of the **webnovel** project: the public webnovel reader service. It owns API routes, business
logic, authentication, authorization, database access, integrations, and background work, and **returns JSON
only** — no frontend rendering or presentation logic.

Its sibling is **`web-novel-web`** (the React SSR frontend, a separate independent repository). The two meet
only at this service's **JSON HTTP API**; the web app consumes that API and must never reach this database or
duplicate this business logic. When both are checked out together they live side by side as
`../web-novel-server` and `../web-novel-web`.

---

## 0. Load the `shadow-library-ecosystem` skill first — every task, no exceptions

**Before any repository operation** — inspecting files, searching, planning, editing, running commands,
managing dependencies, validating — **load and follow the `shadow-library-ecosystem` skill.** This repo is
built entirely on `@shadow-library/*` packages (`app`, `fastify`, `class-schema`, `common`, `modules`,
`auth`), so the skill defines the conventions and the building blocks you must reuse (DI, config, logging,
errors, validation, HTTP routing, DB access, and the root `scripts/` tooling). Do **not** hand-roll anything
the ecosystem already provides, and do not begin work before the skill is loaded.

> If a generic ecosystem pattern conflicts with what is actually in this repo, **the repo wins.** This file
> documents what this codebase really does; follow it over any generic default.

---

## 1. Know where you are, work here only

- **Check the current working directory first.** This workspace's own scripts — `bun install`, `bun run dev`,
  `bun test`, `drizzle-kit …` — run from **inside** `web-novel-server/`. Type-check, `db:*`, `build`, `verify`,
  and `check-migrations` have no workspace-local script and always run from the **repo root** by path
  (`bun scripts/verify.ts apps/web-novel-server`, `bun scripts/db.ts apps/web-novel-server <cmd>`). Either way,
  never run these against `web-novel-web`.
- **Change dependencies only in this repo**, using the existing package manager (**Bun**), and only when
  nothing already installed solves the problem. Never add a dependency here to serve the web app.

## 2. Does the change belong here?

- **Yes (server):** data model, business rules, validation of persisted data, authentication/authorization,
  DB schema or queries, the JSON shape/status codes an endpoint returns, integrations, background work.
- **No (web):** pages, layouts, components, styling, client interaction, SSR/hydration, how a response is
  displayed. If you are tempted to render HTML or shape presentation here, it belongs in `web-novel-web`.
- **Both:** any change to the **API contract** (path, request/response shape, status code, query param,
  header, auth). This service defines and validates it; the web app consumes it — see §6.

## 3. How to work

- **Read before you edit.** Open the module/controller/service you are changing and its neighbors first; match
  their structure, naming, and idioms. Do not introduce a second way of doing something the repo already does
  one way.
- **Prefer minimal, focused changes.** Solve the task; do not opportunistically refactor, rename, or reformat
  beyond what it needs. Broad refactors are a separate, explicitly-requested task.
- **Follow the existing patterns** for naming, typing, validation, error handling, and testing (below). New
  code should be indistinguishable in style from the code around it.

### Conventions

- **Package manager:** Bun (single root `bun.lock`; the root tooling lives in `scripts/`, invoked by path,
  not a CLI). ESM (`"type": "module"`). **TypeScript 6.x**, `strict`, `moduleResolution: bundler`.
- **Path aliases:** `@server/*` → `src/*`, `@modules/*` → `src/modules/*`, `@tests/*` → `tests/*`.
- **Formatting/style:** Prettier — single quotes, trailing commas `all`, print width **180**,
  `arrowParens: avoid`; 2-space indent, semicolons. `PascalCase` types/classes, `camelCase` values,
  `UPPER_SNAKE_CASE` constants; kebab-case files with a role suffix
  (`*.controller.ts` / `*.service.ts` / `*.dto.ts` / `*.module.ts` / `*.spec.ts`).
- **File section banners:** open every source file (not barrels) with the ecosystem's banner blocks in order,
  keeping empty ones — `Importing packages with side effects`, `Importing npm packages`,
  `Importing user defined packages`, `Defining types`, `Declaring the constants`.
- **Named exports + a barrel `index.ts` per folder.** Comment the _why_, never the _what_.

## 4. Commands

This workspace's own scripts run from **inside** `web-novel-server/`; `build`/`verify` are root tooling and
always run from the **repo root** by path. Prerequisites: **Bun ≥ 1.3** and **PostgreSQL** (dev DSN
`postgresql://postgres:postgres@localhost:5432/shadow_webnovel`, see `.env`).

| Purpose                | Command                                                   | Notes                                                                                                      |
| ---------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Install                | `bun install`                                             |                                                                                                            |
| Develop                | `bun run dev`                                             | `bun --watch src/main.ts`, serves on **:8080**                                                             |
| Test                   | `bun test`                                                | Live Postgres: builds a migrated template DB, clones it per test; boots a mock IdP                         |
| Verify (the gate)      | `bun scripts/verify.ts apps/web-novel-server`             | **format + lint + type-check + test**, from the repo root; auto-fix with `--fix`                           |
| Type-check             | _(folded into verify)_                                    | `bunx tsc -p apps/web-novel-server/tsconfig.json --noEmit`, from the repo root                             |
| Build                  | `bun scripts/build.ts apps/web-novel-server`              | Single-file `dist/main.js` (+ `generated/drizzle` assets), from the repo root; run with `bun dist/main.js` |
| Generate migration     | `bun scripts/db.ts apps/web-novel-server generate`        | → `drizzle-kit generate` (schema/out/dialect only, no config file) → `generated/drizzle/`                  |
| Apply migrations       | `bun scripts/db.ts apps/web-novel-server migrate`         | → `src/migrate.ts` (Bun native SQL driver)                                                                 |
| Build test template DB | `bun scripts/db.ts apps/web-novel-server create-template` | → generic root driver, running `src/migrate.ts` against the template DSN                                   |

There is no `build` or `verify` script in this workspace's `package.json` — they are root tooling only. Lint
and format have no standalone scripts either — they run inside `bun scripts/verify.ts`. Ports: **8080** app
(`/health`, `/health/ready`); **8081** HttpCoreModule health server (`HEALTH_ENABLED=true`, on in prod).

## 5. Backend guidance

Feature modules live in `src/modules/<feature>/` (`catalog`, `datastore`, `health`, `publish`, `reader`,
`session`), each a `*.controller.ts` / `*.service.ts` / `*.dto.ts` / `*.module.ts` + barrel. Controllers are
thin adapters; **all business logic lives in services.**

- **JSON responses.** Controllers return a DTO instance (or a service result whose fields match the DTO);
  `@RespondFor(status, Dto)` (or `[Dto]` for arrays) shapes the wire output — only declared fields are emitted,
  so entity secrets never leak. There is **no global success envelope**; list endpoints use `{ items: [...] }`
  or the `Paginated(...)` mixin. Do not hand-build response objects or map with `toResponse()`.
- **HTTP status codes** are explicit and RESTful: `@HttpStatus(n)` for fixed statuses (e.g. `204` for
  delete/logout/no-op), never `reply.status(n)` for those. When the status is data-dependent, have the service
  **throw a typed domain error carrying the status** rather than branch in the controller. Observed
  conventions: `200` applied / `204` no-op / `409` stale (optimistic concurrency) for publish upserts; `302`
  for login/callback redirects; `ETag` + `Cache-Control` with `304` on `If-None-Match` for chapter content;
  `503` health-degraded. `@Res` is only for genuinely hand-built responses (redirects, cookies, ETag).
- **Input validation** is declarative in `*.dto.ts`: `@Schema()` classes with `@Field(() => Type, { … })`
  (`pattern`, `maxLength`, `minimum`/`maximum`, `optional`, `enum`). Coerce path/query strings with
  `@Transform('int:parse' | 'bigint:parse' | …)` — never `Number(...)`/`BigInt(...)` in a handler. Enums via
  `EnumType.create(...)`; paging via the `PaginationQuery(...)` / `Paginated(...)` mixins. Validate at the DTO
  boundary; do not re-validate in services beyond business invariants.
- **Authentication / authorization** — match the existing style (this repo has **no `@Auth` decorator**):
  - Internal/M2M routes use class-level `@RequireScope(PUBLISH_SCOPE)` from `@shadow-library/auth/module`.
  - Reader/session routes resolve identity in-code via `sessionService.authenticate()` (throws the
    unauthenticated domain error if the signed session cookie is absent); cookie-mutating routes use the CSRF
    double-submit token.
  - Reader identity is the OIDC subject; there are **no local user/session tables**. Fail closed.
- **Errors:** throw typed domain errors from `AppErrorCode` (extends `ServerErrorCode`, in `src/classes/`):
  `AppErrorCode.WBN_00X.create({ … })` or `.throw()` (returns `never`, usable inline). Each factory
  (`notFound`/`conflict`/`unauthenticated`/`badRequest`) carries its HTTP status; the fastify layer serializes
  them. Never throw a bare `Error`.
- **Logging:** `Logger.getLogger(APP_NAME, ClassName)` per class; structured — `logger.info('message', { …meta })`.
  Never `console.*`, and never log secrets.
- **Database:** access is via `databaseService.getPostgresClient()` (Drizzle) — `this.db.select()…`,
  `this.db.transaction(async tx => { … })`, row locks with `.for('update')`. Schema lives in
  `src/modules/datastore/schemas/` (barrel `index.ts`); migrations in `generated/drizzle/`. After any schema
  change run `bun scripts/db.ts apps/web-novel-server generate` (from the repo root), commit the SQL, and keep
  `bun scripts/db.ts apps/web-novel-server migrate` working. This repo does
  **not** use a `run()`/`constraintErrorMap` wrapper — follow the direct-client pattern already in the services.
- **Config & env:** typed keys are declared in `bootstrap.ts` via `Config.load(...)` + `ConfigRecords`
  augmentation; read with `Config.get(...)`, never `process.env` directly in app code. Env vars are
  `SCREAMING_SNAKE_CASE` grouped by owner: `DATABASE_POSTGRES_*` (DatabaseModule), `AUTH_*`
  (`@shadow-library/auth`), `SESSION_*` (this app's OIDC client + cookie secret), plus `NODE_ENV`/`PORT`/`LOG_LEVEL`.

## 6. API contract changes span both repos

Any change to an endpoint's path, request shape, response shape, status code, query params, headers, or auth
is a **contract change** shared with `web-novel-web`. Land it deliberately:

1. **Server first (here).** Update the route/controller, DTOs/schemas, service logic, domain errors/status
   codes, and the server tests and fixtures.
2. **Evaluate backward compatibility before changing a live contract.** Prefer additive, non-breaking changes
   (new optional fields, new endpoints). If a change is breaking, say so explicitly and account for who
   produces/consumes the surface: the forge (`novel-forge-server`) pushes content in one direction; the reader
   web app and clients read. Understand those callers before altering the surface.
3. **Then update `web-novel-web`** (in its own repo): regenerate its API types, then update its callers,
   query options, route loaders, components, client-model mapping, **fixtures**, and frontend validation.
4. **Update everything the change touches** here: routes, callers, DTOs/schemas, tests, fixtures, and any
   docs/README affected. Do not leave the contract half-changed.

## 7. Secrets, verification & reporting

- **Never leak secrets or server-only values.** Keep `SESSION_SECRET`, `*_CLIENT_SECRET`, `DATABASE_*`, and
  tokens out of API responses, logs, and error messages. `@RespondFor` already restricts responses to declared
  DTO fields — rely on that rather than returning raw entities.
- **Verify before done:** run `bun scripts/verify.ts apps/web-novel-server` (format + lint + type-check + test)
  from the monorepo root. While iterating you may narrow to `bun test` (inside this workspace) or
  `bunx tsc -p apps/web-novel-server/tsconfig.json --noEmit` (from the repo root) inside this
  workspace, but the full gate must pass.
- **Cross-repo change → verify in both repos.** A green server does not imply a green web app; run the web
  app's gate in `web-novel-web` too.
- **Report per repo, separately.** When you finish, state — for **each** repo you changed — what you changed
  and the exact verification commands you ran there and their result. Do not merge the two, and do not claim a
  repo passed a check you did not run there.
- **No destructive or history/remote-changing Git actions unless explicitly requested.** Do not commit, push,
  force-push, rebase, reset, amend, or delete branches on your own initiative. Editing the working tree is fine.
