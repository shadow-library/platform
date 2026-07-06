# Novel Forge Web

Authoring workspace for Shadow Applications. A React single-page app built with TanStack Router + Query, Ant Design, and Tailwind CSS, bundled with Vite and managed with Bun.

## Tech Stack

| Concern          | Choice                                              |
| ---------------- | --------------------------------------------------- |
| Runtime / PM     | [Bun](https://bun.sh)                               |
| Build tool       | [Vite 7](https://vite.dev)                          |
| UI library       | [React 19](https://react.dev)                       |
| Routing          | [TanStack Router](https://tanstack.com/router) (file-based, auto code-split) |
| Server state     | [TanStack Query](https://tanstack.com/query)        |
| Components        | [Ant Design 6](https://ant.design)                 |
| Styling          | [Tailwind CSS 4](https://tailwindcss.com) + CSS variables |
| Types            | [TypeScript 5](https://www.typescriptlang.org) (strict) |
| Lint / Format    | ESLint + Prettier                                   |
| Git hooks        | Husky + commitlint (Conventional Commits)           |
| E2E tests        | [Playwright](https://playwright.dev)                |

## Prerequisites

- [Bun](https://bun.sh) `>= 1.3`

## Getting Started

```bash
bun install
bun dev
```

The app runs on [http://localhost:3000](http://localhost:3000). Requests to `/api` are proxied to `SERVER_URL` (default `http://localhost:8080`).

## Scripts

| Script                       | Description                                            |
| ---------------------------- | ------------------------------------------------------ |
| `bun dev`                    | Start the dev server on port 3000                      |
| `bun run build`              | Type-check (`tsc`) and build for production            |
| `bun run preview`            | Preview the production build on port 3000              |
| `bun lint`                   | Check formatting (Prettier) and lint (ESLint)          |
| `bun lint --fix`             | Auto-fix formatting and lint issues                    |
| `bun run test`               | Run Playwright end-to-end tests                        |
| `bun run test:setup`         | Install the Chromium browser Playwright needs          |
| `bun run generate:api-types` | Regenerate API types from the backend OpenAPI spec     |

## Project Structure

```
src/
├── components/          Shared, cross-feature UI
│   ├── AppProvider/     Query client + theme context providers
│   ├── Layout/          Top nav, side nav, footer shell
│   └── Logo/            Shadow Applications wordmark
├── constants/           App-wide constants (Ant Design themes)
├── features/            Feature modules (UI + hooks + utils per feature)
├── lib/                 Non-UI building blocks
│   ├── apis/            APIRequest HTTP client + generated types
│   ├── hooks/           Reusable hooks
│   └── utils.ts         Shared helpers (pagination, …)
├── routes/              File-based routes (TanStack Router)
├── main.tsx             App entry point
├── styles.css           Tailwind import + theme CSS variables
└── types.ts             Shared types
```

### Routing

Routes are files under `src/routes`. TanStack Router's Vite plugin generates `src/routeTree.gen.ts` on dev/build — do not edit it by hand. Adding a file such as `src/routes/library/novels/index.tsx` registers the `/library/novels` route automatically.

### Features

Each feature lives in `src/features/<name>` and owns its components, `hooks/`, and `*.utils.ts`, re-exported from an `index.tsx` barrel. Routes stay thin: they import from a feature and render it.

### Theming

The design system is defined once and consumed two ways:

- **Ant Design** components read the `lightTheme` / `darkTheme` token configs in `src/constants/themes.ts`.
- **Tailwind / custom CSS** read the matching CSS variables in `src/styles.css` (e.g. `var(--color-primary)`), switched via the `data-theme` attribute.

`ThemeProvider` persists the choice in `localStorage` and falls back to the OS preference.

### API Layer

`src/lib/apis/api-request.ts` exposes a small fluent `APIRequest` client:

```ts
import { APIRequest } from '@/lib';

const novels = await APIRequest.get('/novels').query({ limit: 20 }).execute();
```

Response and error types come from `src/lib/apis/api-types.gen.ts`, generated from the backend OpenAPI spec. The committed file is a placeholder stub — run `bun run generate:api-types` (configure `OPENAPI_SPEC_URL` in `.env`) to replace it with the real types.

## Code Conventions

- Import blocks are grouped and ordered: npm packages → user-defined packages → user-defined modules, enforced by ESLint `import/order`.
- Single quotes, trailing commas, 180-char line width (Prettier).
- TypeScript runs in strict mode with `noUncheckedIndexedAccess`; exported functions carry explicit return types.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org); husky runs lint + tests pre-commit and validates the message.

## Testing

Playwright drives the built app. First-time setup installs Chromium:

```bash
bun run test:setup
bun run test
```

## License

Proprietary — Shadow Applications.
