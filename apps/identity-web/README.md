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

| Variable     | Default                 | Used by                                                     |
| ------------ | ----------------------- | ----------------------------------------------------------- |
| `SERVER_URL` | `http://localhost:9091` | Server functions (server-side backend base URL) + dev proxy |

## Deployment topology

`SERVER_URL` is read server-side by the Start server. `/oauth2` and `/saml2` are full-page browser
redirects the identity server owns; the dev/preview server proxies them (see `vite.config.ts`). In
production, front the Start server and the identity server with a reverse proxy that routes `/api`,
`/oauth2`, and `/saml2` to the identity server and everything else to Start, keeping the browser
same-origin.
