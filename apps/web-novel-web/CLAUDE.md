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

- **Check the current working directory first.** Confirm you are inside `web-novel-web/` before running
  anything. Every command — `bun install`, `bun run …`, `shadow …`, `vite …`, `vitest …` — runs from this
  repo's root, never from the parent folder and never against `web-novel-server`.
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

- **Package manager:** Bun (single root `bun.lock`; the `shadow` CLI lives in the root `scripts/`
  directory). ESM (`"type": "module"`). **TypeScript 6.x**, `strict`, `moduleResolution: bundler`,
  `verbatimModuleSyntax`.
- **Path alias:** `@/*` → `src/*`.
- **Formatting/style:** Prettier — single quotes, trailing commas `all`, print width **180**,
  `arrowParens: avoid`; 2-space indent, semicolons. `PascalCase` types/classes/components, `camelCase` values,
  `UPPER_SNAKE_CASE` constants; kebab-case files with a role suffix (`*.api.ts`, `*.spec.tsx`, etc.).
- **File section banners:** open source files (not barrels) with the ecosystem's banner blocks in order,
  keeping empty ones — `Importing npm packages`, `Importing user defined packages`, `Defining types`,
  `Declaring the constants`.
- `src/routeTree.gen.ts` is **generated** (excluded from lint, formatted by `format:gen`) — never hand-edit it.
- **Named exports + a barrel `index.ts` per folder.** Comment the *why*, never the *what*.

## 4. Commands

Run from `web-novel-web/`. Prerequisite: **Bun**.

| Purpose | Command | Notes |
| --- | --- | --- |
| Install | `bun install` | |
| Develop | `bun run dev` | `vite dev`, serves on **:3000**; proxies `/api` → `SERVER_URL` (default `http://localhost:8080`) |
| Test | `bun run test` | `vitest run` (jsdom; specs in `tests/**/*.spec.{ts,tsx}`) |
| Verify (the gate) | `bun run verify` | `shadow verify` = **format + lint + type-check + test**; auto-fix with `shadow verify --fix` |
| Type-check | `bun run type-check` | `tsc` |
| Build | `bun run build` | `shadow build` → `bun run build:app` (manifest → `vite build` SSR + client → `vite build` service worker) |
| Run prod build | `bun run start` | `bun main.ts` — the shared `@shadow-library/web` Bun server; ports from `PORT`/`HEALTH_PORT` |
| Regenerate API types | `bun run generate:api-types` | `shadow gen-api-types http://localhost:8080/dev/api-docs/openapi.json --out src/lib/apis/api-types.gen.ts` (server must be running) |

Lint and format have no standalone scripts — they run inside `shadow verify`.

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
- **API consumption.** The browser calls the server on the **same origin at `/api/...`** (relative URLs):
  - General/browser path → `APIRequest` (re-exported from `src/lib/apis/transport.ts`, from
    `@shadow-library/web`); forward the query `signal` (`.signal(signal).timeout(ms)`) so Query can cancel;
    narrow caught errors with `isApiError()`.
  - SSR path that must forward the session cookie → `createServerFetch` in `src/lib/apis/server-fetch.ts`,
    called from a `createServerFn` (dynamically imported so it is stripped from the client bundle).
  - Each `*.api.ts` normalizes lean server DTOs → the internal client model at the boundary. Regenerate wire
    types with `bun run generate:api-types` after a contract change (§6).
- **Browser-only APIs.** Anything touching `window`/`document`/`localStorage`/`navigator`/IndexedDB must be
  guarded — `if (typeof window === 'undefined') return …`, run it in `useEffect`, or wrap it in `ClientOnly`
  (`@shadow-library/ui`). Never touch the DOM during render or at module top-level; it runs on the server too.
- **Server-only code.** Keep it out of the client bundle: server-only modules (e.g. `server-fetch.ts`) are
  reached only via `createServerFn` with a dynamic `import()`. Never import server-only code into a component
  that renders on the client, and never read `process.env` in browser code paths.
- **Hydration consistency.** Server and first client render must match. Do not branch render output on
  `typeof window`, random values, or `Date` during render; put client-only differences behind
  `useEffect`/`ClientOnly`. Theme is set pre-hydration by `themeInitScript` on `<html>` (with
  `suppressHydrationWarning` where intentional) — follow that pattern instead of flipping classes during render.
- **Error handling.** Use the router's error/not-found boundaries (`DefaultCatchBoundary`, `NotFound`); surface
  API failures via `isApiError()` and inline field errors, not raw throws in components.
- **Styling / UI.** Use `@shadow-library/ui` components and `--sh-*` tokens; the design-system CSS is imported
  once (`src/styles.css` → `__root.tsx`). Theme via `data-theme` (`ThemeProvider`, `storageKey="webnovel-theme"`),
  `data-density="touch"` on `<html>`. Do not add Tailwind or another styling system.
- **PWA/offline** uses `@shadow-library/web`'s `buildManifest`, `createServiceWorker` (`src/sw.ts`),
  `useServiceWorker`/`useOnlineStatus`, and the `OfflineStore`/query-persister layer — extend those, don't
  hand-roll service-worker registration or caching.

## 6. API contract changes span both repos

Any change to an endpoint's path, request shape, response shape, status code, query params, headers, or auth
is a **contract change** shared with `web-novel-server`. Land it deliberately:

1. **Server first** (in `web-novel-server`): route/controller, DTOs/schemas, service logic, domain
   errors/status codes, and its tests/fixtures — and **evaluate backward compatibility** there before changing
   a live contract (prefer additive, non-breaking changes; if breaking, account for all callers).
2. **Then here:** regenerate types with `bun run generate:api-types` (server running), then update the affected
   `src/lib/apis/*.api.ts` callers, `queryOptions`, route loaders, components, the internal client-model
   mapping, **fixtures**, and frontend validation.
3. **Update everything the change touches** here: routes, callers, types, query options, tests, fixtures, and
   any docs affected. Do not leave the contract half-changed.

## 7. Secrets, verification & reporting

- **Never expose secrets or server-only environment variables to the client.** Client vars are **`VITE_`-
  prefixed** (read via `import.meta.env`, e.g. `VITE_API_MODE`); server-only vars are unprefixed (read via
  `process.env`, e.g. `SERVER_URL`, `PORT`, `HEALTH_PORT`) and used **only** in SSR/server code. The browser
  never needs the backend origin — it uses relative `/api`. Do not put server-only values into `VITE_` vars,
  `import.meta.env`, the client bundle, or any code path that reaches the browser.
- **Verify before done:** run `bun run verify` (format + lint + type-check + test) from this repo's root.
  While iterating you may narrow to `bun run test` / `bun run type-check`, but the full gate must pass.
- **Cross-repo change → verify in both repos.** A green web app does not imply a green server; run the
  server's gate in `web-novel-server` too.
- **Report per repo, separately.** When you finish, state — for **each** repo you changed — what you changed
  and the exact verification commands you ran there and their result. Do not merge the two, and do not claim a
  repo passed a check you did not run there.
- **No destructive or history/remote-changing Git actions unless explicitly requested.** Do not commit, push,
  force-push, rebase, reset, amend, or delete branches on your own initiative. Editing the working tree is fine.
