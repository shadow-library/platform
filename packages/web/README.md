# @shadow-library/web

The frontend application framework for the Shadow Apps ecosystem — the non-visual half of every Shadow web app. Where [`@shadow-library/ui`](https://github.com/shadow-library/ui) is _how an app looks_, `@shadow-library/web` is _how it is wired, how it talks to the backend, and how it is served_.

It centralizes the pieces every Shadow web app was re-implementing: the typed API transport and error model, the TanStack Router + Query wiring, the SSR session/CSRF plumbing, and the Bun production server.

## Installation

```sh
bun add @shadow-library/web
```

### Peer dependencies

All heavy peers are **optional** — you only need the ones for the subpaths you import.

| You import… | Peer(s) needed |
| --- | --- |
| `@shadow-library/web` (root) | `react` |
| `@shadow-library/web/router` | `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-router-ssr-query` |
| `@shadow-library/web/server` | `@tanstack/react-start` |
| `@shadow-library/web/server-entry` | Bun runtime |
| `@shadow-library/web/pwa` | `react` |
| `@shadow-library/web/offline` | `react` |
| `@shadow-library/web/service-worker` | none (runs inside the service worker) |

## Entry points

### `@shadow-library/web` — isomorphic core

Safe in the browser and on the server; pulls no router/SSR deps.

- **`ApiError`** / **`ErrorResponse`** / **`ErrorField`** — the single error surface every transport raises. Carries `status`, machine `code`, `type`, field-level problems, and `retryAfterSeconds`. `error.fieldErrors` maps the field problems to a `{ field: message }` object for binding inline form errors.
- **`isApiError(value)`** — a type guard that narrows an unknown thrown value (a `catch` binding, a query/mutation error) to `ApiError`. Prefers `instanceof` but falls back to a shape check, so it still holds when the package is bundled twice (the common SSR + client split).
- **`ApiResult<T>`** / **`ApiFailure`** / **`call()`** — the server-function RPC envelope. Handlers return an `ApiResult`; `call()` unwraps it or rehydrates the failure into an `ApiError`.
- **`APIRequest`** — a chainable, thenable HTTP client for browser-origin calls (SPA apps, or anything that hits the API directly rather than through a server function). Chain `.signal(signal)` (forward the `AbortSignal` a TanStack Query `queryFn` receives, so queries cancel on unmount) and `.timeout(ms)` (a hard deadline); an abort propagates as-is rather than as a network error.
- **`generateApi(specUrl)`** — generate a typed client (types + one function per operation, driven by `APIRequest`) from an OpenAPI spec.
- **`useDeviceId(storageKey?)`** — an SSR-safe, localStorage-backed per-browser device id.

```ts
import { ApiError, isApiError, call, APIRequest, useDeviceId } from '@shadow-library/web';

// query cancellation + deadline
const projects = () => queryOptions({ queryKey: ['projects'], queryFn: ({ signal }) => APIRequest.get('/projects').signal(signal).timeout(10_000).execute() });
```

### `@shadow-library/web/router` — TanStack Router/Query wiring

- **`createAppRouter(routeTree, options?)`** — builds a router the Shadow way: a per-request `QueryClient` (never module-level, so one user's dehydrated cache can't leak into another's SSR), the SSR-query integration, and sensible preload/pending defaults. Pass `router` overrides for app-specific bits like `defaultErrorComponent`.
- **`requireAuth(queryClient, query, { loginTo, returnTo })`** — the SSR-safe auth gate for `beforeLoad`: ensures `query` server-side and redirects to `loginTo` on a 401.
- **`useSearchParams()`** — read/update URL query params through the router.

```ts
// src/router.tsx
import { createAppRouter } from '@shadow-library/web/router';
import { routeTree } from './routeTree.gen';

export const getRouter = () => createAppRouter(routeTree, { router: { defaultErrorComponent: ErrorPage } });
```

### `@shadow-library/web/server` — server-only transport

- **`createServerFetch({ baseUrl, csrfCookie?, csrfHeader?, csrfTtlSeconds? })`** — returns the `serverFetch` every server-function handler calls. It forwards the caller's session cookie, satisfies the CSRF double-submit, and relays the backend's `Set-Cookie` headers back to the browser. Import the returned function only from server-function handlers so the Start plugin strips it from the client bundle.

```ts
// src/lib/apis/server-fetch.ts
import { createServerFetch } from '@shadow-library/web/server';

export const serverFetch = createServerFetch({ baseUrl: `${process.env.SERVER_URL}/api/v1` });
```

### `@shadow-library/web/server-entry` — Bun production server

- **`serve({ ssrEntry, clientDir, port?, healthPort? })`** — the production server. The framework's `dist/server` bundle is only the SSR fetch handler; served alone every client asset 404s. `serve()` wraps it: static assets first (immutable cache + gzip), everything else streamed from SSR, a liveness probe on its own port, and graceful drain on shutdown.

```ts
// main.ts
import { serve } from '@shadow-library/web/server-entry';

await serve({
  ssrEntry: new URL('./dist/server/server.js', import.meta.url),
  clientDir: new URL('./dist/client', import.meta.url).pathname,
});
```

### `@shadow-library/web/pwa` — installability, updates, manifest

Client utilities to turn any app into an installable PWA. SSR-safe: every hook and function no-ops on the
server, so they can be called unconditionally.

- **`buildManifest(input)`** / **`manifestResponse(manifest)`** — build a Web App Manifest over sane defaults
  (`standalone`, `start_url: '/'`, `short_name` ← `name`) and serve it as `application/manifest+json`.
- **`pwaHeadLinks(options)`** / **`pwaHeadMeta(options)`** — the `<link>`/`<meta>` descriptors a PWA needs
  (manifest link, theme color, iOS hints), as plain objects that drop into any head manager.
- **`registerServiceWorker(options)`** — register the worker and get a controller (`update`, `applyUpdate`,
  `unregister`, `message`). Update model is **prompt-then-reload**: a new worker waits, `onUpdate` fires, and
  only `applyUpdate()` activates it (reloading once) — no surprise refresh mid-session.
- **`useServiceWorker(options)`** — the same, as a hook: `{ isSupported, isRegistered, updateAvailable, applyUpdate }`.
- **`usePwaInstall()`** — `{ canInstall, isInstalled, promptInstall }` for a custom "Install app" button.
- **`useOnlineStatus()`** — a tearing-free, SSR-safe `navigator.onLine`.

```tsx
// wherever you configure <head> (e.g. a TanStack Start root route)
head: () => ({ links: pwaHeadLinks({ appleTouchIcon: '/icons/apple-touch-icon.png' }), meta: pwaHeadMeta({ themeColor: '#0b0b0f' }) })

// app root
const { updateAvailable, applyUpdate } = useServiceWorker();
const { canInstall, promptInstall } = usePwaInstall();
```

### `@shadow-library/web/service-worker` — the runtime that powers offline

Import this **only** from your worker entry (`src/sw.ts`), which your bundler emits as the registered script.
Caching is entirely runtime-configured (no build-time asset manifest), so the one worker fits any app.

```ts
// src/sw.ts
import { createServiceWorker } from '@shadow-library/web/service-worker';

createServiceWorker({
  version: 'v1', // bump to drop old caches on deploy
  precache: ['/', '/offline'], // app shell for offline navigation
  navigationFallback: '/offline',
  runtimeCaching: [
    { pattern: /\/assets\//, strategy: 'cache-first', maxEntries: 200 },
    { pattern: /\/api\//, strategy: 'network-first', networkTimeoutSeconds: 5, maxAgeSeconds: 300 },
    { pattern: /\.(?:png|jpg|svg|webp|woff2)$/, strategy: 'stale-while-revalidate' },
  ],
});
```

Strategies: `network-first`, `cache-first`, `stale-while-revalidate`, `network-only`, `cache-only`. On
activate it cleans up stale versioned caches; on a navigation failure it serves `navigationFallback`; and any
on-demand downloaded content (below) is served transparently offline. **Emit the worker to `/sw.js`** with
your bundler — e.g. a Vite `rollupOptions.input`, `vite-plugin-pwa`'s injectManifest entry, or a
`?worker`/second build — then register it (`registerServiceWorker({ url: '/sw.js' })`).

### `@shadow-library/web/offline` — download content for offline use

An IndexedDB-backed store for content the user chooses to keep offline. It works with **no service worker**
(the primary path); when a worker is present it can also cache asset URLs so images resolve offline too.

- **`OfflineStore`** — `put`/`get`/`has`/`delete`/`list`/`clear`/`totalSize`/`estimate` over IndexedDB
  (JSON *and* `Blob`s). Construction is side-effect-free (the DB opens lazily), so it is SSR-safe.
- **`OfflineContentManager`** + **`useOfflineDownload(manager?)`** — orchestrate a download: fetch the payload,
  persist it, and (given a `controller` + `assets`) have the worker cache those asset URLs, with progress.
- **`createIDBPersister(options)`** — an IndexedDB `Persister` for `@tanstack/react-query-persist-client`, to
  keep the **whole** query cache across reloads and offline (no extra peer dep).

```tsx
const { controller } = useServiceWorker();
const { entries, download, remove, isDownloading, progress } = useOfflineDownload();

// "Download for offline"
await download({
  key: `novel:${id}`,
  label: novel.title,
  loader: () => APIRequest.get(`/novels/${id}`).execute(), // stored in IndexedDB, readable offline
  assets: [novel.coverUrl], // optional: cached by the service worker for transparent offline serving
  controller,
});
```

The production server (`serve`) already sends the right headers for `/sw.js` (`no-cache` +
`Service-Worker-Allowed: /`) and `*.webmanifest` (`application/manifest+json`); override the worker path(s)
with `serve({ ..., serviceWorkerPaths: ['/sw.js'] })`.

## Relationship to `@shadow-library/ui`

`ui` is now purely a component + design-token library. The API client, error model, OpenAPI codegen, and router hooks that used to live in `ui` moved here — so a UI component library no longer carries data-fetching or framework wiring. The `ApiError` here mirrors the error taxonomy of the backend `@shadow-library/common` package so one error contract flows end to end.

## License

MIT
