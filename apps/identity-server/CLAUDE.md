# identity-server — Agent Guide

The **backend** of Shadow Identity: Bun + TypeScript, Fastify HTTP layer (`@shadow-library/fastify`), Drizzle ORM
over Postgres, Redis-backed opaque sessions, OAuth 2.1 / OIDC. **JSON / REST only.** The consumer SDK
`@shadow-library/auth` lives in its own repository. `.shadowrc.json` → `"type": "backend"`.

Its sibling repository `identity-web` (React 19 SSR, TanStack Start) is a **separate, independent git repo** that
consumes this server's JSON API. It lives at `../identity-web` in the local workspace but is cloned and versioned
on its own. This guide is self-contained for work inside `identity-server`.

---

## ⚠️ ALWAYS load the `shadow-library-ecosystem` skill first

**At the start of every task, before any repository operation, load and follow the `shadow-library-ecosystem`
skill.** It governs how this repo is inspected, searched, edited, built, verified, and how dependencies are
managed. This is a Shadow app (depends on `@shadow-library/*`), so the skill applies in full.

Do **not** inspect files, search code, plan changes, edit files, run commands, or touch dependencies before the
skill is loaded. Reach for the ecosystem packages (`common`, `app`, `class-schema`, `fastify`, `modules`) and the
`shadow` CLI **before** hand-rolling config, logging, errors, DI, HTTP wiring, validation, caching, or DB access.

---

## The server ↔ web boundary

`identity-server` **owns**: API routes, business logic, authentication, authorization, DB access, integrations,
and the background worker. It **returns JSON only** — machine-readable status + error **codes**, never display
text (`docs/standards.md`). It must **never** contain frontend rendering or presentation logic.

`identity-web` consumes this server **only** through its JSON API. It never reads this database and never
duplicates a business rule that lives here. Any rule that must be authoritative, secret, or reused by more than
one client belongs **here**, not in the web app.

### Deciding whether a change belongs here

- **Belongs in `identity-server`** — a new/changed endpoint, business rule, record-level validation, permission
  check, DB schema/query, integration, background job, or anything authoritative or secret.
- **Belongs in `identity-web`** — a page, component, SSR/data-loading concern, or presentation-only validation.
- **Touches both** — any change to the API contract (path, method, request/response shape, status/error codes,
  auth requirement). Change the server first, then coordinate the web side — see
  [Cross-repo API contract changes](#cross-repo-api-contract-changes).

---

## Working rules

1. **Check the current working directory before running any command.** Every command below is scoped to this
   repo — run it from **inside** `identity-server/` (confirm with `pwd`), never from the parent folder or the
   sibling repo.
2. **Read the existing related code before editing.** Find the neighbouring controller/service/DTO/schema and
   follow its conventions. Don't add a second way to do something that already has one.
3. **Prefer minimal, focused changes over broad refactors.** Touch only what the task requires; no opportunistic
   rewrites or reformatting of unrelated code.
4. **Follow the existing patterns** for naming, typing, validation, error handling, and testing (below).
5. **Package manager is `bun`** (`bun.lock`, no `packageManager` field). Use `bun`/`bunx`. Add/upgrade/remove
   deps with `bun add`/`bun remove` **in this repo only** — never edit the sibling repo's `package.json`.
6. **Never run destructive Git operations** — no commits, pushes, rebases, resets, force-pushes, or branch
   deletion unless the user **explicitly** requests it. This repo has its own independent history.

---

## Commands (run inside `identity-server/`)

| Purpose                                        | Command                        |
| ---------------------------------------------- | ------------------------------ |
| Install                                        | `bun install`                  |
| Dev server (watch)                             | `bun run dev`                  |
| Dev worker (watch)                             | `bun run dev:worker`           |
| Build                                          | `bun run build`                |
| Verify — **format + lint + type-check + test** | `bun run verify`               |
| Verify with autofix                            | `bunx shadow verify --fix`     |
| Type-check only                                | `bun run type-check`           |
| Test                                           | `bun test`                     |
| Generate a migration                           | `bun run db:generate`          |
| Apply migrations                               | `bun run db:migrate`           |
| Create test template DB                        | `bun run db:create-template`   |
| Check for uncommitted migration drift          | `bunx shadow check-migrations` |

Lint and format have **no standalone scripts** — they run through `bun run verify` (`shadow verify`); use
`bunx shadow verify --fix` to auto-apply. Copy `.env.example` → `.env` before first run.

---

## Backend patterns — follow these exactly

- **File section banners** open every source file (except barrels), in order, keeping empty ones:
  `Importing packages with side effects` → `Importing npm packages` → `Importing user defined packages` →
  `Defining types` → `Declaring the constants`. npm imports first, then internal (`@server/*`, `@modules/*`,
  `@scripts/*` aliases or relative), separated by a blank line.
- **Feature modules** live in `src/modules/<domain>/<feature>/` as `*.module.ts` / `*.controller.ts` /
  `*.dto.ts` / `*.service.ts` / `*.constants.ts` / `*.types.ts`, each with a barrel `index.ts`.
- **Controllers are thin adapters.** `@HttpController('/api/v1/...')` with **full explicit paths** (no global
  prefix). Route decorators `@Get/@Post/@Patch/@Delete`; params via `@Body()/@Query()/@Params()`. All business
  logic lives in the service; the controller reads inputs + ambient `Context`, calls one service method, returns.
- **JSON response format.** Return a plain object/entity whose fields match the response DTO — no `toResponse()`
  mapping. Declare the wire shape with `@RespondFor(status, Dto)`; only declared fields are emitted (secrets on
  the entity never leak). **Responses carry codes, not display text** — the frontend owns i18n/presentation. IDs
  use the `{resource}_{id}` prefix convention (`usr_`, `sess_`, `org_`, `app_client_`, …).
- **HTTP status codes** are set with `@RespondFor(...)` / `@HttpStatus(n)`, never `reply.status(n)`. A
  data-dependent status comes from the **service throwing a typed error** carrying the status, not a controller
  branch.
- **DTOs** are `@Schema()` classes with `@Field(...)` in `*.dto.ts` (`@shadow-library/class-schema`) — never
  inline in the controller. AJV validates inbound bodies/queries/params against the DTO.
- **Input validation** is schema-first (DTO `@Field` constraints) plus, for record-level rules, a
  `throw new ValidationError('field', ERROR_MESSAGES.X)` in the service; messages live in
  `src/constants/messages.constants.ts` and state the constraint only.
- **Errors** use the `AppErrorCode` catalog (`src/classes/app-error-code.ts`, extends `ServerErrorCode`):
  `throw AppErrorCode.USR_001.create()` (helpers `notFound`/`conflict`/… with an optional HTTP-status override).
  Invariant/infra failures → `AppError.internal(reason, cause?)`. Never throw a bare `Error`.
- **Authentication & authorization** are declarative. Put `@Auth({...})` at class level and override per method
  (same axis merges cleanly). Options: `session`, `elevated` (AAL2 step-up), `permission` (admin PDP), `orgRole`/
  `orgMember`/`orgParam`, `service` (M2M), `public`. The `AccessGuard` resolves identity into `request.auth`;
  handlers read it via the **ambient `Context`** (`Context.getSession()`, `getAuth()`, `getActor()`,
  `getMembership()`, `getOrganisation()`, `getServiceToken()`, `getClientInfo()`) — **not** a `@Ctx` param. An
  undecorated route is unguarded; state intent with `@Auth({ public: true })`.
- **Logging** via `Logger.getLogger(APP_NAME, ClassName.name)` (`APP_NAME = 'shadow-identity'`). Never `console.*`.
- **Config** via `Config` — never `process.env`. Register keys in `src/bootstrap.ts` (`Config.load(...)`) and
  augment `ConfigRecords`; read with `Config.get(...)`. `bootstrap.ts` is imported for side effects at the top of
  `app.module.ts`.
- **Database operations** go through `DatabaseService.getPostgresClient()` (Drizzle relational API —
  `db.query.*.findFirst`, `.transaction(...)`, `and/eq/inArray`). Wrap writes so constraint violations surface as
  domain errors: `.catch(error => this.databaseService.translateError(error))`, with the `constraintErrorMap`
  (`datastore.constants.ts`) mapping constraint names → prebuilt `AppError`s. No raw try/catch at call sites.
  Schema changes go through `bun run db:generate` → committed SQL in `generated/drizzle` (also a build asset).
- **Testing** with `bun test`. Specs are `*.spec.ts` under `tests/<domain>/`. Boot the real app via
  `TestEnvironment` / `ShadowFactory` (clones a per-suite DB from a migrated template); drive HTTP through the
  router (`getRouter()`), using the `csrfPair()` helper for cookie-auth mutations. `describe('UnitOrRoute')` →
  `it('should ...')`. Coverage threshold is 0.9.

---

## Environment & secrets

Read the authoritative key list and defaults from `.env.example`. Keys are `SCREAMING_SNAKE_CASE`, grouped by a
domain prefix that maps to dotted config keys (`DATABASE_POSTGRES_URL` → `database.postgres.url`): `DATABASE_*`,
`AUTH_*`, `OAUTH_*`, `RATE_LIMIT_*`, `SECURITY_*`, `SERVER_*`, `WORKER_*`, `SERVICE_URL_*`, `NODE_ENV`. Read them
through `Config`, never `process.env`.

`SECURITY_MASTER_ENCRYPTION_KEY`, `DATABASE_POSTGRES_URL`, admin bootstrap credentials, etc. are **server-only
secrets** — never expose them, or any server-only config, in an API response body. Only fields declared on a
`@RespondFor` DTO are emitted, which keeps secrets on the entity from leaking; keep it that way.

Service-to-service calls (e.g. to pulse-server) use `svc://` discovery — configure via `SERVICE_URL_*`, never
hard-code a hostname.

---

## Cross-repo API contract changes

This server **owns** the API contract and publishes it as OpenAPI at `/dev/api-docs/openapi.json` (non-prod).
`identity-web` consumes a generated mirror of it. Any change to a path, method, request/response shape, status
code, error code, or auth requirement is a **both-repos** change:

1. **Change the server first** — controller, DTO(s), service, error codes/statuses, and specs. Run `bun run verify`
   here.
2. **Evaluate backward compatibility before changing an existing API.** Prefer additive, non-breaking changes.
   For a breaking change, find every `identity-web` caller first and plan them into the same change; call out the
   break explicitly.
3. **Coordinate the web side** (in `../identity-web`): it regenerates its API types from this server's OpenAPI
   and updates its server functions, hooks, callers, fixtures, and tests. Update affected server-side tests,
   fixtures, and `docs/` here.
4. **Verify BOTH repositories** for a cross-repo change — `bun run verify` (and relevant tests) in each, from
   inside each repo.

Never make the web app work around a server shortcoming by duplicating server logic — fix it here.

---

## Reporting your work

When you finish, report clearly:

- **What changed** in `identity-server`.
- **Which verification commands you actually ran** and their results (e.g. `bun run verify`, `bun test`,
  `bun run type-check`). For a cross-repo change, report `identity-server` and `identity-web` **separately** and
  show verification for both.

State plainly what passed, what failed (with output), and anything you skipped and why.
