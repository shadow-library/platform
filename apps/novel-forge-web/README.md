# Novel Forge Web

Authoring workspace for Shadow Applications. A server-rendered React app built with TanStack Start (Router + Query) — full-document SSR with route-loader data fetching — bundled with Vite and managed with Bun.

## Tech Stack

| Concern         | Choice                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Runtime / PM    | [Bun](https://bun.sh)                                                                                    |
| Framework       | [TanStack Start](https://tanstack.com/start) (full-document SSR)                                         |
| Build tool      | [Vite 7](https://vite.dev) via the root `scripts/` tooling (`bun scripts/build.ts`)                      |
| UI library      | [React 19](https://react.dev)                                                                            |
| Routing         | [TanStack Router](https://tanstack.com/router) (file-based, auto code-split)                             |
| Server state    | [TanStack Query](https://tanstack.com/query)                                                             |
| Components      | `@shadow-library/ui` (CSS Modules + `--sh-*` design tokens)                                              |
| Transport / SSR | `@shadow-library/web` (server functions + `createServerFetch`, `createAppRouter`, `serve`)               |
| Auth            | Session-gated via `requireAuth` — every route is private                                                 |
| Types           | [TypeScript 6](https://www.typescriptlang.org) (strict)                                                  |
| Lint / Format   | `bun scripts/verify.ts` (shared ESLint + Prettier ruleset, plus this workspace's own `eslint.config.ts`) |
| Git hooks       | Husky → `bun scripts/verify.ts --fast` pre-commit / commitlint on the message (Conventional Commits)     |
| E2E tests       | [Playwright](https://playwright.dev)                                                                     |

## Prerequisites

- [Bun](https://bun.sh) `>= 1.3`

## Getting Started

```bash
bun install
bun dev
```

The dev server runs on [http://localhost:3000](http://localhost:3000). Every backend call travels through TanStack Start server functions to `API_ORIGIN` (default `http://localhost:8080`) — see `src/lib/apis/server-fetch.ts`. The dev `/api` proxy remains only for the interactive `/api/auth/*` login redirects. All routes are session-gated: `GET /api/auth/session` must answer 200, else the app redirects to `/api/auth/login?returnTo=…`.

## Scripts

| Script               | Description                                                                     |
| -------------------- | ------------------------------------------------------------------------------- |
| `bun dev`            | Start the TanStack Start dev server (SSR) on port 3000                          |
| `bun run type-check` | Type-check only (`tsc --noEmit`)                                                |
| `bun run start`      | Run the production SSR server (`serve.ts` → `@shadow-library/web/server-entry`) |
| `bun run test`       | Run Playwright end-to-end tests                                                 |
| `bun run test:setup` | Install the Chromium browser Playwright needs                                   |

This workspace has no `build`, `verify`, or `generate:api-types` script — those are root tooling, run from the
repo root by path:

| Command                                             | Description                                        |
| --------------------------------------------------- | -------------------------------------------------- |
| `bun scripts/build.ts apps/novel-forge-web`         | The client + SSR server bundles to `dist/`         |
| `bun scripts/verify.ts apps/novel-forge-web`        | Format (Prettier) + lint (ESLint) + type-check     |
| `bun scripts/verify.ts apps/novel-forge-web --fix`  | Auto-fix formatting and lint issues                |
| `bun scripts/gen-api-types.ts apps/novel-forge-web` | Regenerate API types from the backend OpenAPI spec |

## Production

`bun scripts/build.ts apps/novel-forge-web` emits `dist/client` (hashed assets) and `dist/server` (the SSR fetch handler). `serve.ts` boots `serve` from `@shadow-library/web/server-entry`: static assets with immutable caching + gzip, streamed SSR, and graceful drain, on `PORT` (default 3000). Liveness lives on its own port — `GET /healthz` on `HEALTH_PORT` (default 3001) — so probes never touch the backend or the renderer. Backend calls happen server-side through Start server functions against `API_ORIGIN`; there is no `/api` proxy in production, so the ingress must route `/api/auth/*` (the interactive login redirect) to novel-forge-server directly. The shared, monorepo-root-context [`docker/Dockerfile`](../../docker/Dockerfile) builds and runs exactly this — see [`docker/README.md`](../../docker/README.md) for the exact `--target runtime-ssr --build-arg APP=novel-forge-web --build-arg SSR_ENTRY=serve.ts` command.

## Project Structure

```
generated/               Generated artifacts (routeTree.gen.ts — outside the lint/format globs)
src/
├── components/          Shared, cross-feature UI (providers, layout shell, nf primitives)
├── features/            Feature modules (UI + hooks + utils per feature)
├── lib/                 Non-UI building blocks
│   ├── apis/            APIRequest facade + server-fetch transport + session + generated types
│   └── session.ts       requireSession — the requireAuth gate every route group runs
├── routes/              File-based routes (TanStack Router)
├── router.tsx           createAppRouter wiring (per-request QueryClient + SSR query integration)
├── styles.css           @shadow-library/ui styles + app CSS variables
└── types.ts             Shared types
```

### Routing

Routes are files under `src/routes`. TanStack Router's Vite plugin generates `generated/routeTree.gen.ts` on dev/build — do not edit it by hand. Adding a file such as `src/routes/library/novels/index.tsx` registers the `/library/novels` route automatically.

### Features

Each feature lives in `src/features/<name>` and owns its components, `hooks/`, and `*.utils.ts`, re-exported from an `index.tsx` barrel. Routes stay thin: they import from a feature and render it.

### Theming

The design system is `@shadow-library/ui`: components are styled with CSS Modules over `--sh-*` design tokens, switched via the `data-theme` attribute on `<html>`. App CSS in `src/styles.css` composes the same tokens. `ThemeProvider` persists the choice in `localStorage` and falls back to the OS preference (`themeInitScript` runs before paint to avoid a flash).

### API Layer

`src/lib/apis/api-request.ts` exposes the same fluent `APIRequest` builder the screens have always used, now a facade over `@shadow-library/web`: every call is a TanStack Start server function whose handler goes through `createServerFetch` (session-cookie forwarding + CSRF double-submit + `Set-Cookie` relay), and failures surface as the shared `ApiError` (`isApiError`, `fieldErrors`).

```ts
import { APIRequest } from '@/lib';

const novels = await APIRequest.get('/novels').query({ limit: 20 }).execute();
```

Response and error types come from `src/lib/apis/api-types.gen.ts`, generated from the backend OpenAPI spec via
`bun scripts/gen-api-types.ts apps/novel-forge-web` (run from the repo root).

## Code Conventions

- Lint, formatting, and commit-message rules are the ecosystem's shared ruleset (root `eslint.config.ts`,
  `.prettierrc.json`, `commitlint.config.ts`). This workspace **does** have its own `eslint.config.ts` layering
  deviations on top of the root config; there is no per-repo Prettier or commitlint config.
- Single quotes, trailing commas, 180-char line width; imports grouped npm → user-defined and sorted.
- TypeScript runs in strict mode with `noUncheckedIndexedAccess`; exported functions carry explicit return types.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org); husky runs `bun scripts/verify.ts
--fast` pre-commit (scoped to changed workspaces) and commitlint on the message.

## Testing

Playwright drives the built app. First-time setup installs Chromium:

```bash
bun run test:setup
bun run test
```

## License

Proprietary — Shadow Applications.
