# Shadow Identity — Web

The server-rendered web front end for Shadow Identity: the hosted auth flows (`/login`, `/register`,
`/recover`, `/consent`), the account portal (`/account`, `/applications`, `/organizations`), and the
operator console (`/console`). Built with **TanStack Start** (SSR), **TanStack Router**, and **TanStack
Query** on React 19.

## Architecture

- **Full-document SSR.** Every route renders on the server first; `src/routes/__root.tsx` owns the
  `<html>` document (head metadata, theme boot script, `<Scripts />`).
- **Server functions are the only path to the identity API.** Each endpoint is a `createServerFn`
  handler that runs on the Start server and goes through `src/lib/apis/server-fetch.ts`, which forwards
  the caller's session cookie to the identity server, replays the CSRF double-submit token, and relays
  the backend's `Set-Cookie` headers back to the browser. The browser never calls the backend directly,
  so no backend URL, secret, or cookie logic ships in the client bundle.
- **Route loaders own route-critical data.** `queryOptions` factories in `src/lib/apis/*.api.ts` are
  ensured in route `loader`s (`queryClient.ensureQueryData`) so data is in the SSR HTML; components read
  the warm cache through the same hooks. Mutations stay `useMutation` → server function.
- **SSR-safe auth.** `_portal` and `console` guard the session in `beforeLoad` (`src/lib/session.ts`):
  an unauthenticated request is redirected server-side (302) with the destination preserved, so no
  protected markup is ever sent. Admin authorization is enforced by the identity server per endpoint.
- **Per-request QueryClient.** Created in `getRouter()` (`src/router.tsx`) and wired to SSR
  dehydration/hydration via `@tanstack/react-router-ssr-query`, so no cache leaks between requests.

## Prerequisites

The identity server (this repo's sibling `identity-server`) must be running. Bring up its datastores
and start it on port **9091**:

```bash
cd ../identity-server
docker compose -f docker-compose.dev.yml up -d   # postgres + redis
bun run db:migrate
PORT=9091 bun run src/main.ts
```

## Commands

```bash
bun install
bun run dev          # Vite + Start dev server on http://localhost:3000
bun run build        # production build → dist/client + dist/server
bun run start        # serve the production build (Bun — main.ts) — set SERVER_URL + PORT
bun run typecheck    # tsc --noEmit
bun run lint         # prettier -c + eslint
bun run test         # Playwright e2e (needs the backend up); test:setup installs Chromium
bun run generate:api-types   # regenerate src/lib/apis/api-types.gen.ts from the OpenAPI spec
```

## Environment

| Variable           | Default                                        | Used by                                                     |
| ------------------ | ---------------------------------------------- | ----------------------------------------------------------- |
| `SERVER_URL`       | `http://localhost:9091`                        | Server functions (server-side backend base URL) + dev proxy |
| `OPENAPI_SPEC_URL` | `http://localhost:9091/dev/api-docs/openapi.json` | `generate:api-types`                                     |

## Deployment topology

`SERVER_URL` is read server-side by the Start server. `/oauth2` and `/saml2` are full-page browser
redirects the identity server owns; the dev/preview server proxies them (see `vite.config.ts`). In
production, front the Start server and the identity server with a reverse proxy that routes `/api`,
`/oauth2`, and `/saml2` to the identity server and everything else to Start, keeping the browser
same-origin.
