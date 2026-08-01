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

The dev server runs on [http://localhost:3000](http://localhost:3000). Every backend call travels through
TanStack Start server functions to `API_ORIGIN` (default `http://localhost:8080`) — see
`src/lib/apis/server-fetch.ts`. The dev `/api` proxy remains only for the interactive `/api/auth/*` login
redirect. Every route under `/_app` is session-gated: `GET /api/auth/session` must answer 200, else the
app redirects to `/login`, which hands the browser to `/api/auth/login?return_to=…`.

## Production

`bun scripts/build.ts apps/pulse-web` emits `dist/client` (hashed assets) and `dist/server` (the SSR fetch
handler). `serve.ts` boots `serve` from `@shadow-library/web/server-entry`: static assets with immutable caching + gzip,
streamed SSR, and graceful drain, on `PORT` (default 3000). Liveness lives on its own port — `GET
/healthz` on `HEALTH_PORT` (default 3001) — so probes never touch the backend or the renderer. Backend
calls happen server-side through Start server functions against `API_ORIGIN`; there is no `/api` proxy in
production, so the ingress must route `/api/auth/*` (the interactive login redirect) to pulse-server
directly. This workspace's own, monorepo-root-context [`Dockerfile`](./Dockerfile) builds and runs
exactly this — see its header comment for the exact command (`docker build -f apps/pulse-web/Dockerfile .`,
run from the repo root, no build-arg needed).
