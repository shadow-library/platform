# Frontend reference — canonical Shadow web app conventions

Load this when writing or changing frontend code. First determine the rendering model — do NOT assume:

| Signal                                                                      | Model                                                                                                    | Example workspace                                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| No `@tanstack/react-start` dep, `ReactDOM.createRoot` (inferred type `spa`) | Client-rendered SPA — no server render pass; no SSR-only code, no `hydrateRoot`, no server functions     | none currently — all four web apps are `ssr` (`pulse-web` converted from `spa`)     |
| `@tanstack/react-start` dep (inferred type `ssr`)                           | SSR (TanStack Start) — render must be deterministic server/client; browser APIs only in effects/handlers | `apps/identity-web`, `apps/novel-forge-web`, `apps/pulse-web`, `apps/web-novel-web` |

(The type is inferred from the workspace's path and dependencies — there is no config file declaring it.)

## UI & styling

- MUST mount `@shadow-library/ui`: `import '@shadow-library/ui/styles.css'` once at the root
  (`styles.layer.css` for `@layer`-scoped). Theme via `data-theme`/`data-density` on `<html>` and
  `--sh-*` token overrides; add `ThemeProvider` and inline `themeInitScript()` in `<head>`.
- MUST compose from `ui` components and the shipped utility classes (`flex`, `stack`, `p-16`, …), with
  CSS Modules (`*.module.css`) for custom styling. MUST NOT add Tailwind or any other styling system.
- Use `cn` from `ui` for className combining — MUST NOT add `clsx`/`tailwind-merge`.
- Before writing a new component or date/pagination helper, search api-catalog.md → ui: the library
  ships ~70 components (including `AccessDenied` for 403-style empty states) plus pure utilities
  (`derivePaginationState`, `getInitials`, `matchPath`, date helpers, …).

## Transport & error model

- Browser → API: `APIRequest` from `@shadow-library/web` (root). Server functions (SSR only):
  `call()` + `createServerFetch` (`/server`).
- MUST forward the TanStack Query `signal`: `APIRequest.get(url).signal(signal)` (add `.timeout(ms)`)
  so navigations can cancel; the abort propagates as an abort, not an `ApiError`.
- Error handling: narrow caught `unknown` with `isApiError()`; `error.fieldErrors` is the
  `{ field: message }` map for inline form errors. One error contract flows backend → UI (`ApiError`
  mirrors `common`'s taxonomy). For a 403/not-entitled response, pair `web/router`'s `isAccessDeniedError`/
  `parseAccessDeniedSearch` helpers with `ui`'s `AccessDenied` component rather than hand-rolling another
  empty state.
- Typed clients: `generateApi(specUrl)` or the workspace's generated `api-types.gen.ts`
  (regenerated with `bun scripts/gen-api-types.ts <workspace>` from the repo root, against a running
  server) — MUST NOT hand-edit generated files.

## Router, data loading, prod server

- Router/Query wiring MUST come from `createAppRouter(routeTree, { router? })`
  (`@shadow-library/web/router`) — it owns the per-request QueryClient, SSR-query integration, and
  preload/pending defaults. MUST NOT hand-roll `getRouter()` + `setupRouterSsrQueryIntegration`. (A
  `type: spa` workspace still uses `createAppRouter` for the router+query wiring — it just has no
  server render pass to integrate.)
- Protected routes: gate `beforeLoad` with the generic
  `requireAuth(queryClient, queryOptions<T>(), { loginTo, returnTo })` — the data type is inferred, no cast.
  Back it with the backend's `GET /auth/session` (registered by `AuthModule.forRoot()`): that endpoint
  exists so a browser client can discover login state **without ever seeing or parsing a token**, and
  `loginTo` should point at the backend's `GET /auth/login`. MUST NOT read the session cookie from JS —
  it is `HttpOnly` and carries an opaque handle, not a token. See `references/auth.md`.
- Query-option factories live in the workspace's API layer (e.g. `src/lib/apis/*.api.ts`); ensure data in
  route `beforeLoad`/`loader` via the router's `queryClient`.
- Production server (SSR apps): `serve({ ssrEntry, clientDir, port?, healthPort? })` from
  `/server-entry` — static assets, SSR streaming, liveness probe, graceful drain. MUST NOT write a
  custom static+SSR server.

## PWA (app plumbing — distinct from ui's mobile layer; the two compose)

- Manifest: `buildManifest(...)`/`manifestResponse` + `pwaHeadLinks`/`pwaHeadMeta` in `<head>` (`/pwa`).
- Service worker registration: `registerServiceWorker`/`useServiceWorker` — update model is
  **prompt-then-reload**: show a refresh prompt on `updateAvailable`, then `applyUpdate()`; never a
  surprise mid-session refresh. Install/online state: `usePwaInstall`, `useOnlineStatus`.
- The worker itself is a 3-line `src/sw.ts` calling `createServiceWorker(config)` (`/service-worker`)
  that the bundler emits to `/sw.js` (the one inherent build step — Vite `rollupOptions.input`,
  `vite-plugin-pwa` injectManifest, or a second build — `apps/web-novel-web` wires a second Vite build
  step this way, see its `build:app` script). Caching strategies live in its `runtimeCaching` rules —
  MUST NOT hand-roll SW registration or caching. `serve()` already sends the right `/sw.js` +
  `*.webmanifest` headers.
- All `/pwa` and `/offline` exports are SSR-safe (no-op without browser APIs) — call unconditionally.

## Offline data

- Download selected content into `OfflineStore` (`/offline`, IndexedDB, works with no service worker)
  via `useOfflineDownload`/`OfflineContentManager`.
- Persist the whole TanStack Query cache with `createIDBPersister`.

## Mobile / touch layer (`ui`)

- Set `data-density="touch"` on `<html>` → finger-first control metrics (md control = 44px). Sub-44px
  controls already extend invisible hit areas under `@media (pointer: coarse)`.
- Safe-area insets and dynamic-viewport heights are handled by the tokens (`--sh-tap-target`,
  `--sh-safe-*`) and edge-anchored components — MUST NOT hand-roll `env(safe-area-inset-*)`/`dvh`/tap
  targets.
- App shell is auto-responsive: compose `Shell` + `Sidebar` + `TopNavigation` as on desktop; below
  768px the sidebar becomes a hamburger drawer automatically, no props.
- Component selection on phone layouts: `BottomNavigation` (3–5 top-level destinations),
  `ActionSheet` (contextual actions, replacing anchored `DropdownMenu`/`ContextMenu` on touch),
  `Fab` (the screen's single promoted action), `PullToRefresh` (list refresh), `SwipeActions`
  (leading/trailing row actions), `BottomSheet` (thumb-reachable overlay where desktop would use
  `Dialog`/`Popover`).

## Secrets & env isolation

- A web workspace has no server business logic: MUST NOT place server logic, DB access, or secrets in
  `src/` — it all ships to the browser. Only deliberately-public, bundler-prefixed vars (e.g. Vite
  `VITE_*`) may be referenced from client code; server-only values stay in the dev proxy / `serve.ts`
  layer. Some apps are stricter still — `identity-web` and `web-novel-web` deliberately avoid ever
  exposing a backend origin to the client, keeping every backend call inside a server function even
  though `VITE_*` would technically be available; follow the workspace's existing pattern rather than
  introducing a new one.
