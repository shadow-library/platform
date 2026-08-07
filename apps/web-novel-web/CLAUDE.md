# web-novel-web

The frontend of the **webnovel** project: a React SSR application on **TanStack Start**. It owns routes,
pages, layouts, components, SSR, client interaction, frontend validation, and API consumption. It talks to the
backend **only** through its JSON HTTP API — it never reaches backend storage and never duplicates backend
business logic.

Its sibling is **`web-novel-server`** (the JSON API backend, a separate independent repository). The two meet
only at that service's HTTP API. When both are checked out together they live side by side as
`../web-novel-web` and `../web-novel-server`.

---

## 0. Load the `shadow-library-ecosystem` skill first — every task, no exceptions

**Before any repository operation** — inspecting files, searching, planning, editing, running commands,
managing dependencies, validating — **load and follow the `shadow-library-ecosystem` skill.** This app is
built on `@shadow-library/ui` (components + design tokens) and `@shadow-library/web` (typed API transport,
router/SSR setup, prod server, PWA/offline), so the skill defines the conventions and the building blocks you
must reuse. Do **not** hand-roll transport, routing, SSR wiring, service workers, or UI the ecosystem already
provides, and do not begin work before the skill is loaded.

> If a generic ecosystem pattern conflicts with what is actually in this repo, **the repo wins.** This file
> documents what this codebase really does; follow it over any generic default.

---

## 1. Know where you are, work here only

- **Check the current working directory first.** This workspace's own scripts — `bun install`, `bun run dev`,
  `bun run test`, `bun run start` — run from **inside** `web-novel-web/`. Type-check has no workspace-local
  script and, like root tooling (`build`, `verify`, `gen-api-types`), always runs from the **repo root** by
  path (`bun scripts/verify.ts apps/web-novel-web`, `bunx tsc -p apps/web-novel-web/tsconfig.json --noEmit`).
  Either way, never run these against `web-novel-server`.
- **Change dependencies only in this repo**, using the existing package manager (**Bun**), and only when
  nothing already installed solves the problem. Never add a dependency here to serve the backend.

## 2. Does the change belong here?

- **Yes (web):** pages, routes, layouts, components, styling, client-side interaction and state, SSR/hydration,
  frontend form validation and UX, how a response is displayed, PWA/offline behavior.
- **No (server):** data model, business rules, validation of persisted data, authentication/authorization, DB
  access, the JSON shape/status codes an endpoint returns. If you are tempted to re-implement a business rule
  or reach a database here, it belongs in `web-novel-server`; call the API instead.
- **Both:** any change to the **API contract** (path, request/response shape, status code, query param,
  header, auth). The server defines and validates it; this app consumes it — see §6.

## 3. How to work

- **Read before you edit.** Open the route/feature/component you are changing and its neighbors first; match
  their structure, naming, and idioms. Do not introduce a second way of doing something the repo already does
  one way.
- **Prefer minimal, focused changes.** Solve the task; do not opportunistically refactor, rename, or reformat
  beyond what it needs. Broad refactors are a separate, explicitly-requested task.
- **Follow the existing patterns** for naming, typing, validation, error handling, and testing (below). New
  code should be indistinguishable in style from the code around it.

### Conventions

- **Package manager:** Bun (single root `bun.lock`; the root tooling lives in `scripts/`, invoked by path,
  not a CLI). ESM (`"type": "module"`). **TypeScript 6.x**, `strict`, `moduleResolution: bundler`,
  `verbatimModuleSyntax`.
- **Path alias:** `@/*` → `src/*`.
- **Formatting/style:** Prettier — single quotes, trailing commas `all`, print width **180**,
  `arrowParens: avoid`; 2-space indent, semicolons. `PascalCase` types/classes/components, `camelCase` values,
  `UPPER_SNAKE_CASE` constants; kebab-case files with a role suffix (`*.api.ts`, `*.spec.tsx`, etc.).
- **Comments:** keep implementation comments only for non-obvious rationale, security boundaries, SSR behavior,
  compatibility constraints, or ordering requirements. Do not add section banners or restate names, types, or
  control flow. Reusable type and option fields retain caller-facing JSDoc when their semantics are not evident
  from the type alone.
- `src/routeTree.gen.ts` is **generated** (excluded from lint, formatted by `format:gen`) — never hand-edit it.
- **Named exports + a barrel `index.ts` per folder.** Comment the _why_, never the _what_.

## 4. Commands

This workspace's own scripts run from **inside** `web-novel-web/`; `build`/`verify`/`gen-api-types` are root
tooling and always run from the **repo root** by path. Prerequisite: **Bun**.

| Purpose              | Command                                           | Notes                                                                                                                                                          |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install              | `bun install`                                     |                                                                                                                                                                |
| Develop              | `bun run dev`                                     | `vite dev`, serves on **:3000**; proxies `/api` → `API_ORIGIN` (falling back to `SERVER_URL`, default `http://localhost:8080`)                                 |
| Test                 | `bun run test`                                    | `vitest run` (jsdom; specs in `tests/**/*.spec.{ts,tsx}`)                                                                                                      |
| Type-check           | _(folded into verify)_                            | `bunx tsc -p apps/web-novel-web/tsconfig.json --noEmit`, from the repo root                                                                                    |
| Run prod build       | `bun run start`                                   | `bun main.ts` — the shared `@shadow-library/web` Bun server; ports from `PORT`/`HEALTH_PORT`                                                                   |
| Verify (the gate)    | `bun scripts/verify.ts apps/web-novel-web`        | **format + lint + type-check + test**, from the repo root; auto-fix with `--fix`                                                                               |
| Build                | `bun scripts/build.ts apps/web-novel-web`         | Runs this workspace's `"shadow".command` (`bun run build:app`: `vite build` SSR + client, writing the manifest via an inline Vite plugin, then service worker) |
| Regenerate API types | `bun scripts/gen-api-types.ts apps/web-novel-web` | Fetches `http://localhost:8080/dev/api-docs/openapi.json` and writes `src/lib/apis/api-types.gen.ts` (server must be running)                                  |

There is no `build`, `verify`, or `generate:api-types` script in this workspace's `package.json` — they are
root tooling only. Lint and format have no standalone scripts either — they run inside
`bun scripts/verify.ts`. This workspace opts back into the `test` step during `verify`
(`"shadow": { "verifyTest": true }` in its `package.json`), unlike other web apps.

## 5. Frontend guidance — TanStack Start SSR

React 19 + TanStack Start/Router/Query on `@shadow-library/{ui,web}`. Routes are **file-based** under
`src/routes/`; feature screens in `src/features/`; the API layer in `src/lib/apis/`. `main.ts` runs the shared
`@shadow-library/web` Bun server against the build output.

- **Routing & data loading.** Add routes as files under `src/routes/` (`createFileRoute` / the
  `createRootRouteWithContext<{ queryClient }>()` root). Load data through React Query `queryOptions` factories
  in `src/lib/apis/*.api.ts` — prefetch with `void queryClient.prefetchQuery(...)` (non-blocking) or
  `queryClient.ensureQueryData(...)` (blocking) in a `loader`. Gate protected routes in `beforeLoad`
  (e.g. `requireSession(context.queryClient, returnTo)`). Validate search params with `validateSearch` and
  guard open redirects (as `login.tsx` does). The router comes from `createAppRouter` in `src/router.tsx` — do
  not hand-roll `createRouter`.
- **API consumption.** One isomorphic client, configured once in `src/lib/apis/transport.ts` via
  `createApiClient`. The browser calls the server on the **same origin at `/api/...`**; SSR reaches
  webnovel-server directly through `@shadow-library/web/server`'s `createSsrTransport`, wired inline in
  `transport.ts` behind the `import.meta.env.SSR` guard, forwarding the caller's cookie. Call sites do not
  choose — `APIRequest.get('/novels')` does the right thing in both:
  - Paths are **surface-relative**: `APIRequest` is rooted at `/api`, so write `/novels`, not `/api/novels`.
    The `/api/auth` surface is `apiClient.auth`, wrapped by `createAuthApi` in `session.api.ts`.
  - Forward the query `signal` (`.signal(signal).timeout(ms)`) so Query can cancel; narrow caught errors with
    `isApiError()`. Use `.result<T>()` instead of `.execute<T>()` where a specific failure is a value rather
    than an error (the signed-out 401 on the session read).
  - The CSRF double-submit is handled by the shared transport on both paths — do not attach it by hand.
  - Each `*.api.ts` normalizes lean server DTOs → the internal client model at the boundary. Regenerate wire
    types with `bun scripts/gen-api-types.ts apps/web-novel-web` (from the repo root) after a contract change (§6).
- **Browser-only APIs.** Anything touching `window`/`document`/`localStorage`/`navigator`/IndexedDB must be
  guarded — `if (typeof window === 'undefined') return …`, run it in `useEffect`, or wrap it in `ClientOnly`
  (`@shadow-library/ui`). Never touch the DOM during render or at module top-level; it runs on the server too.
- **Server-only code.** Keep it out of the client bundle: the SSR transport is reached only through the
  `import.meta.env.SSR ? () => import('@shadow-library/web/server').then(…) : undefined` thunk in
  `transport.ts`. That guard is mandatory — a bare `() => import(...)` is never _called_ in the browser, but
  Rollup still bundles its target for the client and the build fails on `node:stream`. The origin
  (`API_ORIGIN`/`SERVER_URL`) is resolved inside that thunk so the `process.env` reads never reach the client.
  Never import server-only code into a component that renders on the client, and never read `process.env` in
  browser code paths.
- **Hydration consistency.** Server and first client render must match. Do not branch render output on
  `typeof window`, random values, or `Date` during render; put client-only differences behind
  `useEffect`/`ClientOnly`. Theme is set pre-hydration by `themeInitScript` on `<html>` (with
  `suppressHydrationWarning` where intentional) — follow that pattern instead of flipping classes during render.
- **Error handling.** Use the router's error/not-found boundaries (`DefaultCatchBoundary`, `NotFound`); surface
  API failures via `isApiError()` and inline field errors, not raw throws in components.
- **Styling / UI.** Use `@shadow-library/ui` components and `--sh-*` tokens; the design-system CSS is imported
  once (`src/styles.css` → `__root.tsx`). Theme via `data-theme` (`ThemeProvider`), `data-density="touch"` on
  `<html>`. Do not add Tailwind or another styling system.
  - **Theme is platform-wide, not app-local.** It lives in a cookie shared with the other Shadow apps, so a
    switch here changes them too; `legacyStorageKey="webnovel-theme"` exists only to migrate the pre-cookie
    `localStorage` value. Read and write it through `useTheme()` (`mode`/`setMode`, where `mode: 'system'`
    means no stored choice). Never keep a second copy in `settings-store` — it would silently fight the cookie.
- **PWA/offline** uses `@shadow-library/web`'s `buildManifest`, `createServiceWorker` (`src/sw.ts`),
  `useServiceWorker`/`useOnlineStatus`, and the `OfflineStore`/query-persister layer — extend those, don't
  hand-roll service-worker registration or caching.

## 6. API contract changes span both repos

Any change to an endpoint's path, request shape, response shape, status code, query params, headers, or auth
is a **contract change** shared with `web-novel-server`. Land it deliberately:

1. **Server first** (in `web-novel-server`): route/controller, DTOs/schemas, service logic, domain
   errors/status codes, and its tests/fixtures — and **evaluate backward compatibility** there before changing
   a live contract (prefer additive, non-breaking changes; if breaking, account for all callers).
2. **Then here:** regenerate types with `bun scripts/gen-api-types.ts apps/web-novel-web` (server running, run
   from the repo root), then update the affected
   `src/lib/apis/*.api.ts` callers, `queryOptions`, route loaders, components, the internal client-model
   mapping, and frontend validation.
3. **Update everything the change touches** here: routes, callers, types, query options, tests, and
   any docs affected. Do not leave the contract half-changed.

## 7. Secrets, verification & reporting

- **Never expose secrets or server-only environment variables to the client.** Client vars are **`VITE_`-
  prefixed** (read via `import.meta.env`, e.g. `VITE_THEME_COOKIE_DOMAIN`); server-only vars are unprefixed (read via
  `process.env`, e.g. `API_ORIGIN`, `PORT`, `HEALTH_PORT`) and used **only** in SSR/server code. The browser
  never needs the backend origin — it uses relative `/api`. Do not put server-only values into `VITE_` vars,
  `import.meta.env`, the client bundle, or any code path that reaches the browser.
- **Verify before done:** run `bun scripts/verify.ts apps/web-novel-web` (format + lint + type-check + test)
  from the monorepo root. While iterating you may narrow to `bun run test` (inside this workspace) or
  `bunx tsc -p apps/web-novel-web/tsconfig.json --noEmit` (from the repo root), but the full gate must pass.
- **Cross-repo change → verify in both repos.** A green web app does not imply a green server; run the
  server's gate in `web-novel-server` too.
- **Report per repo, separately.** When you finish, state — for **each** repo you changed — what you changed
  and the exact verification commands you ran there and their result. Do not merge the two, and do not claim a
  repo passed a check you did not run there.
- **No destructive or history/remote-changing Git actions unless explicitly requested.** Do not commit, push,
  force-push, rebase, reset, amend, or delete branches on your own initiative. Editing the working tree is fine.
