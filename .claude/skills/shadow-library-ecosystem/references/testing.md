# Testing reference — Shadow workspace test conventions

Load this when writing or changing tests in any `apps/*`/`packages/*` workspace.

## Universal conventions

- Runner: **`bun test`** (Bun's native runner) for unit/integration specs. Spec files are `*.spec.ts`,
  colocated per the workspace's existing layout (commonly a `tests/` tree mirroring `src/`; mirror the
  workspace). `packages/ui` is the exception — it uses Vitest (`unit` + `storybook` projects) because it
  needs a browser-like DOM; follow its own conventions there, not `bun:test`.
- `describe` blocks name the unit or route; test names MUST start with `should`.
- `bun scripts/verify.ts <workspace>` (from the repo root) runs the workspace's own `test` script when it
  defines one (a Playwright suite, `vitest run`, a composed sequence — whatever the workspace genuinely
  needs), otherwise falls back to running `bun test` directly — for everything except the web apps and
  `e2e` — `identity-web`, `novel-forge-web`, and `pulse-web` are excluded because their `test` is a
  Playwright e2e suite needing a live backend, while `web-novel-web` opts back in with `"shadow": {
"verifyTest": true }` in its `package.json`. Check that key before assuming verify covered the tests.
  Workspaces carry **no** `type-check` package.json script either — `verify` runs `tsc` directly against
  the workspace's own `tsconfig.json`, unconditionally, for every workspace.

## Backend integration style — boot real modules

- Boot a real module graph per `describe`: `ShadowFactory.create(TestAppModule)`.
- Mock at the **module boundary**, not the unit's internals: a test `@Module` provides
  `{ token: DatabaseService, useValue: { … } }`-style value providers for the dependencies you replace.
  Alternatively pass `ShadowFactory.create(AppModule, { overrides: [provider] })` — the `overrides`
  option swaps providers by token without a bespoke test module.
- Auth fixtures: use `createTestSigner` / `createTestIdP` from `@shadow-library/auth/testing` to mint
  verifiable tokens — never hand-roll JWTs in specs.
- HTTP specs drive the real router: grab it with `app.get(Dispatcher) as FastifyRouter` and issue
  requests via `router.mockRequest().get('/path')` (and siblings for other methods/bodies — follow an
  existing spec in the workspace for the exact chain; _the full `mockRequest` API is not documented in
  the catalog — derive from existing specs_).
- Stop the app in teardown so lifecycle hooks run (`app.stop()` in `afterAll` — mirror existing specs).

## What belongs where

- **This file:** conventions that hold across every workspace in this monorepo.
- **The workspace's own `CLAUDE.md`/`README.md`** (`apps/<name>/CLAUDE.md`, `packages/<name>/CLAUDE.md`):
  workspace-specific test infrastructure — e.g. a server whose specs need a running PostgreSQL and a
  template database (`bun scripts/db.ts <workspace> create-template`, from the repo root — there is no
  `db:*` package.json script), or a web app whose e2e suite is Playwright (`bun run test`; install its
  browser once with `bunx playwright install --with-deps chromium` — only `e2e/` and `packages/ui` still
  carry their own `test:setup` script for this). MUST read the workspace's own doc before running its
  tests and MUST NOT assume `bun test` alone is sufficient.
- **The root `e2e/` workspace:** cross-app flows against already-deployed service URLs (`E2E_*` env
  vars) — not a substitute for a workspace's own tests, and not something you drive by standing up a
  local compose deployment.

## Verification honesty

If tests could not run (missing DB, missing browser install, no network, no deployed `E2E_*` targets),
report that explicitly — never imply a suite passed that was skipped.
