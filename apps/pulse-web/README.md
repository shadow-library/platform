# Pulse Web

Notification operations console for Shadow Applications: dashboard, message templates, layout/partial
design system, sender profiles, routing rules, message log, and manual send. A server-rendered React app
built with TanStack Start (Router + Query) — full-document SSR — bundled with Vite and managed with Bun.

## Tech Stack

| Concern         | Choice                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Runtime / PM     | [Bun](https://bun.sh)                                                                        |
| Framework        | [TanStack Start](https://tanstack.com/start) (full-document SSR)                             |
| Build tool       | [Vite 7](https://vite.dev) via the `shadow` CLI (root `scripts/` tooling)                    |
| UI library       | [React 19](https://react.dev)                                                                |
| Routing          | [TanStack Router](https://tanstack.com/router) (file-based, auto code-split)                 |
| Server state     | [TanStack Query](https://tanstack.com/query)                                                 |
| Components       | `@shadow-library/ui` (CSS Modules + `--sh-*` design tokens)                                  |
| Transport / SSR  | `@shadow-library/web` (server functions + `createServerFetch`, `createAppRouter`, `serve`)   |
| Auth             | Session-gated via `requireAuth` — every route under `/_app` is private                       |
| Types            | [TypeScript 6](https://www.typescriptlang.org) (strict)                                      |
| Lint / Format    | `shadow verify` (shared ESLint + Prettier ruleset)                                           |
| Git hooks        | Husky → `shadow verify` / `shadow commit-msg` (Conventional Commits)                         |
| E2E tests        | [Playwright](https://playwright.dev)                                                         |

## Prerequisites

- [Bun](https://bun.sh) `>= 1.3`

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

## Scripts

| Script                       | Description                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `bun dev`                    | Start the TanStack Start dev server (SSR) on port 3000                          |
| `bun run build`              | `shadow build` — the client + SSR server bundles to `dist/`                     |
| `bun run type-check`         | Type-check only (`tsc`)                                                         |
| `bun run start`              | Run the production SSR server (`serve.ts` → `@shadow-library/web/server-entry`) |
| `bun run verify`             | `shadow verify` — format (Prettier) + lint (ESLint) + type-check                |
| `bun run verify --fix`       | Auto-fix formatting and lint issues                                             |
| `bun run test`               | Run Playwright end-to-end tests                                                 |
| `bun run test:setup`         | Install the Chromium browser Playwright needs                                   |
| `bun run generate:api-types` | Regenerate API types from the backend OpenAPI spec                              |

## Production

`bun run build` emits `dist/client` (hashed assets) and `dist/server` (the SSR fetch handler). `serve.ts`
boots `serve` from `@shadow-library/web/server-entry`: static assets with immutable caching + gzip,
streamed SSR, and graceful drain, on `PORT` (default 3000). Liveness lives on its own port — `GET
/healthz` on `HEALTH_PORT` (default 3001) — so probes never touch the backend or the renderer. Backend
calls happen server-side through Start server functions against `API_ORIGIN`; there is no `/api` proxy in
production, so the ingress must route `/api/auth/*` (the interactive login redirect) to pulse-server
directly. The shared, monorepo-root-context [`docker/Dockerfile`](../../docker/Dockerfile) builds and runs
exactly this — see [`docker/README.md`](../../docker/README.md) for the exact `--target runtime-ssr
--build-arg APP=pulse-web --build-arg SSR_ENTRY=serve.ts` command.

## Project Structure

```
generated/               Generated artifacts (routeTree.gen.ts — outside the lint/format globs)
src/
├── components/          Shared, cross-feature UI (providers, layout shell, route error boundary)
├── features/            Feature modules (dashboard, templates, design, senders, routing, send, logs)
├── lib/                 Non-UI building blocks
│   ├── apis/            APIRequest facade + server-fetch transport + session + generated types
│   └── session.ts       requireSession — the requireAuth gate every route group runs
├── routes/              File-based routes (TanStack Router)
├── router.tsx            createAppRouter wiring (per-request QueryClient + SSR query integration)
└── styles.css            @shadow-library/ui styles + app CSS variables
```

### Routing

Routes are files under `src/routes`. TanStack Router's Vite plugin generates `generated/routeTree.gen.ts`
on dev/build — do not edit it by hand. Every screen except `/login` sits under the `/_app` layout route,
whose `beforeLoad` runs `requireSession` before any protected markup renders.

### Features

Each feature lives in `src/features/<name>` and owns its components and utilities, re-exported from an
`index.ts` barrel. Routes stay thin: they import from a feature and render it.

### Theming

The design system is `@shadow-library/ui`: components are styled with CSS Modules over `--sh-*` design
tokens, switched via the `data-theme` attribute on `<html>`. App CSS in `src/styles.css` composes the same
tokens. `ThemeProvider` persists the choice in `localStorage` and falls back to the OS preference
(`themeInitScript` runs before paint to avoid a flash).

### API Layer

`src/lib/apis/api-request.ts` exposes the same fluent `APIRequest` builder the screens have always used,
now a facade over `@shadow-library/web`: every call is a TanStack Start server function whose handler goes
through `createServerFetch` (session-cookie forwarding + CSRF double-submit + `Set-Cookie` relay), and
failures surface as the shared `ApiError` (`isApiError`).

```ts
import { APIRequest } from '@/lib';

const templates = await APIRequest.get('/templates').query({ limit: 20 }).execute();
```

Response and error types come from `src/lib/apis/api-types.gen.ts`, generated from the backend OpenAPI
spec via `bun run generate:api-types` (`shadow gen-api-types`).

## Code Conventions

- Lint, formatting, and commit-message rules are the ecosystem's shared ruleset, driven by
  `.shadowrc.json` — no per-repo ESLint/Prettier/commitlint config.
- Single quotes, trailing commas, 180-char line width; imports grouped npm → user-defined and sorted.
- TypeScript runs in strict mode with `noUncheckedIndexedAccess`; exported functions carry explicit
  return types.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org); husky runs `shadow verify`
  pre-commit and `shadow commit-msg` on the message.

## Testing

Playwright drives the built app. First-time setup installs Chromium:

```bash
bun run test:setup
bun run test
```

## License

Proprietary — Shadow Applications.
