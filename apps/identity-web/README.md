# Shadow Identity — Web

The server-rendered web front end for Shadow Identity: the hosted auth flows (`/login`, `/register`,
`/recover`, `/consent`), the account portal (`/account`, `/applications`, `/organizations`), and the
operator console (`/console`). Built with TanStack Start (SSR). See `CLAUDE.md` for architecture and
frontend/SSR conventions.

## Prerequisites

The identity server (this repo's sibling `identity-server`) must be running. Bring up its datastores
and start it on port **9091**:

```bash
cd ../identity-server
docker compose -f docker-compose.dev.yml up -d   # postgres + redis
cd ../..
bun scripts/db.ts apps/identity-server migrate
cd apps/identity-server
SERVER_PORT=9091 bun run src/main.ts
```

## Environment

| Variable     | Default                 | Used by                                                    |
| ------------ | ----------------------- | ---------------------------------------------------------- |
| `SERVER_URL` | `http://localhost:9091` | The SSR transport (server-side backend origin) + dev proxy |

## Deployment topology

One origin, split by path. The browser calls the same-origin `/api/*`, and the reverse proxy in front routes
that prefix to the identity server — along with `/oauth2` and `/saml2`, the full-page browser redirects the
identity server owns — and everything else to the Start server. The dev/preview server proxies the same
three prefixes (see `vite.config.ts`) so local development matches.

SSR takes none of that: `SERVER_URL` is read server-side only, and `src/lib/apis/ssr-transport.ts` reaches
the identity server directly with it, forwarding the caller's cookies and user agent. The browser never
receives a backend URL.
