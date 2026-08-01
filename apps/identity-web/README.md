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
SERVER_PORT=9091 bun run src/main.ts
```

## Commands

```bash
bun install
bun run dev          # Vite + Start dev server on http://localhost:3000
bun run start        # serve the production build (Bun — main.ts) — set SERVER_URL + PORT
bun run type-check   # tsc
bun run test         # Playwright e2e (needs the backend up); test:setup installs Chromium

# from the repo root, by workspace path — this workspace has no build/verify/generate:api-types script:
bun scripts/build.ts apps/identity-web              # ssr build → dist/client + dist/server
bun scripts/verify.ts apps/identity-web             # format + lint + type-check (e2e stays a separate step)
bun scripts/gen-api-types.ts apps/identity-web      # regenerate src/lib/apis/api-types.gen.ts from the OpenAPI spec
```

Tooling (build type, format, commitlint rules) is centralized in the root `scripts/` tooling, invoked by path —
there is no `shadow` CLI and no `.shadowrc.json`; both were retired. This workspace **does** have its own
`eslint.config.ts` (it deviates from the root ESLint config); there is no per-repo Prettier or commitlint config.
Root-level husky hooks own commit linting and pre-commit checks across the whole monorepo.

## Environment

| Variable     | Default                 | Used by                                                     |
| ------------ | ----------------------- | ----------------------------------------------------------- |
| `SERVER_URL` | `http://localhost:9091` | Server functions (server-side backend base URL) + dev proxy |

## Deployment topology

`SERVER_URL` is read server-side by the Start server. `/oauth2` and `/saml2` are full-page browser
redirects the identity server owns; the dev/preview server proxies them (see `vite.config.ts`). In
production, front the Start server and the identity server with a reverse proxy that routes `/api`,
`/oauth2`, and `/saml2` to the identity server and everything else to Start, keeping the browser
same-origin.
