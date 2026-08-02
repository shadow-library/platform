# Pulse Web

Notification operations console for Shadow Applications: dashboard, message templates, layout/partial
design system, sender profiles, routing rules, message log, and manual send. A server-rendered React app
built with TanStack Start (full-document SSR). See the `shadow-library-ecosystem` skill's `frontend.md`
for conventions.

## Getting Started

```bash
bun install
bun dev
```

The dev server runs on [http://localhost:3000](http://localhost:3000). Backend calls go to the same-origin
`/api/*`, which the dev `/api` proxy forwards to `API_ORIGIN` (default `http://localhost:8080`) — the same
prefix the production ingress routes to pulse-server. During SSR there is no browser to resolve a relative
URL or supply cookies, so those calls go out through `createSsrTransport` (`@shadow-library/web/server`)
instead, which reaches `API_ORIGIN` directly. Both halves are one client, configured in
`src/lib/apis/transport.ts`. Every route under `/_app` is session-gated: `GET /api/auth/session` must answer
200, else the app redirects to `/login`, which hands the browser to `/api/auth/login?return_to=…`.

## Production

`bun scripts/build.ts apps/pulse-web` emits `dist/client` (hashed assets) and `dist/server` (the SSR fetch
handler). `serve.ts` boots `serve` from `@shadow-library/web/server-entry`: static assets with immutable caching + gzip,
streamed SSR, and graceful drain, on `PORT` (default 3000). Liveness lives on its own port — `GET
/healthz` on `HEALTH_PORT` (default 3001) — so probes never touch the backend or the renderer. Backend
calls reach the backend two ways, and the deployment must serve both from one origin: the ingress routes
`/api/*` to pulse-server (browser calls and the interactive login redirect alike) and everything else here,
while SSR bypasses the ingress and reaches pulse-server directly at `API_ORIGIN` — in-cluster, so set it to
the Service DNS name. `serve.ts` deliberately does not proxy `/api`; the ingress owns that split. This workspace's own, monorepo-root-context [`Dockerfile`](./Dockerfile) builds and runs
exactly this — see its header comment for the exact command (`docker build -f apps/pulse-web/Dockerfile .`,
run from the repo root, no build-arg needed).
