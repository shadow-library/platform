# identity-web — Agent Guide

The **frontend** of Shadow Identity: React 19 + TanStack Start **SSR**, TanStack Router + Query,
`@shadow-library/ui` for components/theming, `@shadow-library/web` for transport/router/SSR. Its workspace type
(`ssr`) is inferred by the root tooling from its `apps/*-web` path and its `@tanstack/react-start` dependency —
there is no config file that sets it. Full-document SSR — `src/routes/__root.tsx` owns `<html>`.

Its sibling workspace `identity-server` (Bun + Fastify JSON API) serves the HTTP API this app consumes. It lives
at `../identity-server` in this monorepo; both are workspaces of the platform repository with a single shared
history. This guide is self-contained for work inside `apps/identity-web`.

---

## ⚠️ ALWAYS load the `shadow-library-ecosystem` skill first

**At the start of every task, before any repository operation, load and follow the `shadow-library-ecosystem`
skill.** It governs how this repo is inspected, searched, edited, built, verified, and how dependencies are
managed. This is a Shadow app (depends on `@shadow-library/*`), so the skill applies in full.

Do **not** inspect files, search code, plan changes, edit files, run commands, or touch dependencies before the
skill is loaded. Reach for `@shadow-library/ui` (components/theming) and `@shadow-library/web` (transport, router,
SSR, prod server) and the root `scripts/` tooling **before** hand-rolling API transport, routing, SSR, or UI
components.

---

## The web ↔ server boundary

`identity-web` **owns**: routes, pages, layouts, components, SSR, client interactions, frontend validation, and
API consumption. It reaches the backend **only** through `identity-server`'s JSON API. It must **never** access
backend storage directly or duplicate backend business logic.

`identity-server` owns all authoritative logic, authN/authZ, DB access, and integrations, and returns JSON with
machine-readable status + error **codes** (this app owns i18n/presentation). Any rule that must be authoritative,
secret, or reused by more than one client belongs in the **server**, not here.

### Deciding whether a change belongs here

- **Belongs in `identity-web`** — a page, route, layout, component, client interaction, SSR/data-loading concern,
  or presentation-only validation (immediate UX feedback).
- **Belongs in `identity-server`** — an authoritative rule, record-level validation, permission check, DB query,
  or integration. Never re-implement one of these here.
- **Touches both** — any change to the API contract (path, method, request/response shape, status/error codes,
  auth requirement). The server changes first, then this app follows — see
  [Cross-repo API contract changes](#cross-repo-api-contract-changes).

---

## Working rules

1. **Check the current working directory before running any command.** `build`/`verify`/`gen-api-types` are root
   tooling and always run from the **repo root** by path (`bun scripts/verify.ts apps/identity-web`); this
   workspace's own scripts (`dev`, `start`, `preview`, `test`, …) run from **inside** `identity-web/` (confirm with
   `pwd`). Never mix the two up.
2. **Read the existing related code before editing.** Find the neighbouring route/feature/component/`*.api.ts` and
   follow its conventions. Don't add a second way to do something that already has one.
3. **Prefer minimal, focused changes over broad refactors.** Touch only what the task requires; no opportunistic
   rewrites or reformatting of unrelated code.
4. **Follow the existing patterns** for naming, typing, validation, error handling, and testing (below).
5. **Package manager is `bun`** (single root `bun.lock`; the root tooling lives in `scripts/`, invoked by path,
   not a CLI). Use `bun`/`bunx`. Add/upgrade/remove deps with `bun add`/`bun remove` **in this workspace
   only** — never edit another workspace's `package.json` to solve a problem here.
6. **Never run destructive Git operations** — no commits, pushes, rebases, resets, force-pushes, or branch
   deletion unless the user **explicitly** requests it. This monorepo's history is shared across every
   workspace — a destructive operation here isn't scoped to just this workspace.

---

## Commands

Root tooling — always run from the **repo root**, by workspace path:

| Purpose                                        | Command                                          |
| ---------------------------------------------- | ------------------------------------------------ |
| Build (→ `dist/client` + `dist/server`)        | `bun scripts/build.ts apps/identity-web`         |
| Verify — **format + lint + type-check**        | `bun scripts/verify.ts apps/identity-web`        |
| Verify with autofix                            | `bun scripts/verify.ts apps/identity-web --fix`  |
| Regenerate API types from the server's OpenAPI | `bun scripts/gen-api-types.ts apps/identity-web` |

This workspace's own scripts — run from **inside** `identity-web/`:

| Purpose                       | Command           |
| ----------------------------- | ----------------- |
| Install                       | `bun install`     |
| Dev (Vite + Start, port 3000) | `bun run dev`     |
| Production start              | `bun run start`   |
| Preview a build               | `bun run preview` |

There is no `build`, `verify`, `type-check`, `generate:api-types`, or `test` script in this workspace's
`package.json` — they are root tooling only (or, for `test`, simply absent). `bun scripts/verify.ts
apps/identity-web` runs format + lint + type-check only (type-check runs `tsc` directly against this
workspace's tsconfig; this workspace is a web app, so `verify` doesn't run tests by convention). This
workspace carries **no test suite** — browser e2e coverage was removed from the per-app Playwright setup
and will be rebuilt in the root `e2e/` workspace; unit tests may be added here later if the app grows
logic worth covering in isolation. Copy `.env.example` → `.env` before first run.

---

## Frontend / SSR patterns — follow these exactly

- **File section banners** open every source file (except barrels): `Importing npm packages` →
  `Importing user defined packages` → `Defining types` → `Declaring the constants` (api files use
  `Declaring the server functions`). npm imports first, then `@/`-aliased local imports; CSS-module import last.
- **Routing** is TanStack Start **file-based** in `src/routes/` (generated `src/routeTree.gen.ts` — never edit by
  hand). `_`-prefixed layout/pathless routes (`_auth`, `_portal`), `$`-prefixed dynamic params (`$orgId`,
  `invite.$token`). Define routes with `createFileRoute('/path')({ ... })`; type query params with
  `validateSearch`.
- **Data loading** happens in route `loader`s via `context.queryClient.ensureQueryData(...)` (parallelise with
  `Promise.all`) so data is in the SSR HTML; components read the warm cache with `use*Query()` hooks and mutate
  with `use*Mutation()`. The router comes from `getRouter()` → `createAppRouter(...)` (`@shadow-library/web/router`),
  which owns the per-request `QueryClient` and SSR-query wiring.
- **Server-only code vs browser-only APIs.** The backend is reached through the one client configured in
  `src/lib/apis/api-request.ts` — `APIRequest.get('/me').execute<MeResponse>()`, paths relative to `/api/v1`.
  It is isomorphic: in the browser it calls the same-origin `/api/v1/...` (the reverse proxy routes that
  prefix to the identity server, so cookies and the CSRF double-submit work natively), and during SSR it goes
  out through `src/lib/apis/ssr-transport.ts`, which reaches `SERVER_URL` directly and forwards the caller's
  cookies and user agent. Do not hand-roll a `createServerFn` for a backend call. `SERVER_URL` and all server
  env are read **server-side only** — the `import.meta.env.SSR` guard in `api-request.ts` keeps the SSR module
  and its origin out of the client bundle. Never inline the backend URL into browser code, and never touch
  browser-only APIs (`window`, `document`, `localStorage`) during render — gate them behind `ClientOnly`,
  effects, or `import.meta.env.DEV`.
- **Hydration consistency.** `__root.tsx` owns the full document and sets `suppressHydrationWarning` where the
  theme runs a pre-paint boot script (`themeInitScript`, `data-theme`). Keep server and client render output
  deterministic and identical — no `Date.now()`/random/locale-dependent output during render; mount browser-only
  widgets and devtools inside `ClientOnly`. (Hydration-mismatch coverage previously lived in a
  `hydration.spec.ts` Playwright spec here; that suite was removed — see Commands above.)
- **Error handling.** Narrow caught errors with `isApiError(cause)` (not `instanceof` — SSR and client bundles
  carry separate class identities); branch on `cause.status`/`cause.code`, read field errors from `cause.fields`
  (`[{ msg }]`), respect `cause.retryAfterSeconds` on 429. Statuses that resolve to a typed body instead of
  throwing are declared on the request with `.modeled(401)` / `.modeled(429)` — see `auth.api.ts`, where the
  interactive flows answer 401/429 with a `FlowState` rather than an error envelope. Route-level failures
  surface through `DefaultCatchBoundary`.
- **Auth-protected routes** gate in `beforeLoad` with `requireSession(context.queryClient, location.href)`
  (`src/lib/session.ts`, built on `requireAuth`), which ensures the session query server-side and 302-redirects to
  `/login` preserving `returnTo`. Admin authorization is enforced by the **server** per endpoint (a 403 surfaces
  in the route error boundary) — do not re-implement it here.
- **Frontend validation** is presentation-only: inline, immediate UX checks in components (no schema library).
  Server functions declare a `.validator()`, but the authoritative validation is the server's.
- **UI** composes `@shadow-library/ui` components. Import `@shadow-library/ui/styles.css` once (via
  `src/styles.css`), theme with `data-theme` + `--sh-*`/`--si-*` tokens, style with co-located `*.module.css` CSS
  modules and the shipped utility classes. Do not add Tailwind or another styling system.
- **Testing.** This workspace has no test suite (see Commands above) — browser e2e coverage that used to
  live here as `@playwright/test` specs under `tests/` was removed and will be rebuilt in the root `e2e/`
  workspace against deployed services, not migrated in place.

---

## Environment & secrets

Read the authoritative key list and defaults from `.env.example`. `SERVER_URL`, `OPENAPI_SPEC_URL`, and
`PUBLIC_ROOT_DOMAIN` are all **server-only** — read only in `src/lib/apis/ssr-transport.ts`, the remaining
server functions, and `vite.config.ts`. The browser reaches the backend by relative path, so it never receives
a backend URL; the only `VITE_`-prefixed var is `VITE_THEME_COOKIE_DOMAIN` — the public parent domain the
shared light/dark theme cookie is written for, which has to reach the client because the theme is set there.
Treat that as the bar for any future `VITE_` var.

**Never expose secrets or server-only environment variables to the client.** Do not add a `VITE_`-prefixed var
(or otherwise inline a value into the client bundle) that carries a secret, credential, backend URL, or any
server-only config. Server-only env belongs behind the `import.meta.env.SSR` boundary in `api-request.ts` or
inside a `createServerFn` handler — `runtime-config.api.ts` is the model for the latter.

---

## Cross-repo API contract changes

The API contract is the only coupling. `identity-server` owns it (OpenAPI at `/dev/api-docs/openapi.json`); this
app consumes a generated mirror at `src/lib/apis/api-types.gen.ts`. Any change to a path, method, request/response
shape, status code, error code, or auth requirement is a **both-repos** change:

1. **Server first.** The change lands in `../identity-server` (controller, DTOs, service, errors/statuses, specs)
   and is verified there.
2. **Evaluate backward compatibility before relying on a changed API.** Prefer additive, non-breaking changes; for
   a breaking change, plan every affected caller here into the same change and call out the break explicitly.
3. **Regenerate the API types** with `bun scripts/gen-api-types.ts apps/identity-web` against the running server
   (updates `api-types.gen.ts`; this file is excluded from format/lint).
4. **Update every affected caller here** — the `*.api.ts` server function, its query/mutation hooks, callers,
   `validateSearch`, and fixtures.
5. **Verify BOTH workspaces** for a cross-repo change — `bun scripts/verify.ts apps/identity-web` and
   `bun scripts/verify.ts apps/identity-server` (and the relevant tests), from the repo root.

Never change a contract on this side only, and never duplicate a server rule to work around it — fix the server.

---

## Reporting your work

When you finish, report clearly:

- **What changed** in `identity-web`.
- **Which verification commands you actually ran** and their results (e.g. `bun scripts/verify.ts
apps/identity-web`, `bun run test`). For a cross-repo change, report `identity-web` and
  `identity-server` **separately** and show verification for both.

State plainly what passed, what failed (with output), and anything you skipped and why.
