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

## Relationship to `@shadow-library/ui`

`ui` is now purely a component + design-token library. The API client, error model, OpenAPI codegen, and router hooks that used to live in `ui` moved here — so a UI component library no longer carries data-fetching or framework wiring. The `ApiError` here mirrors the error taxonomy of the backend `@shadow-library/common` package so one error contract flows end to end.

## License

MIT
