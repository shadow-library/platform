# Testing reference — Shadow workspace test conventions

Load this when writing or changing tests in any `apps/*`/`packages/*` workspace.

## Universal conventions

- Runner: **`bun test`** (Bun's native runner) for unit/integration specs. Spec files are `*.spec.ts`,
  colocated per the workspace's existing layout (commonly a `tests/` tree mirroring `src/`; mirror the
  workspace). `packages/ui` is the exception — it uses Vitest (`unit` + `storybook` projects) because it
  needs a browser-like DOM; follow its own conventions there, not `bun:test`.
- `describe` blocks name the unit or route; test names MUST start with `should`.
- `bun scripts/verify.ts <workspace>` (from the repo root) runs the workspace's own `test` script when it
  defines one, otherwise falls back to running `bun test` directly, for every workspace that opts in via
  `verifyTest` (every `apps/*` workspace and every `packages/*` library does; check the workspace's own
  `package.json` `"shadow"` key if unsure). Workspaces carry **no** `type-check` package.json script either
  — `verify` runs `tsc` directly against the workspace's own `tsconfig.json`, unconditionally, for every
  workspace.
- Fast dev loop: `bun scripts/verify.ts <workspace> --unit` runs only the test step — always `bun test`
  directly (a workspace's own `test` script, e.g. a composed sequence, is bypassed on purpose) — skipping
  format/lint/type-check. Seconds, not the full verify; run it only for the workspace you're changing.
  `--ci` (composable with `--unit` or the full verify) fails an `apps/*` workspace's test step on any test
  over the 50ms hard cap instead of only warning; CI always passes it.

## `apps/*` — unit tests only

Every test under `apps/*` is a unit test: the unit under test is instantiated directly with fakes for
everything outside it (`new Service(fakeA, fakeB)`). MUST NOT boot a `ShadowApplication`, Fastify, or use
`mockRequest()`; MUST NOT connect to a real Postgres, Redis, or the network; MUST NOT use `mock.module`
from `bun:test` (process-global — it leaks across files; use constructor injection instead).

- Per-test budget: 10ms (test body). `bun scripts/verify.ts <workspace> --unit` reports anything over;
  `--ci` hard-fails anything over 50ms.
- Shared fakes live as `testing` subpath exports of the ecosystem packages — reach for these before
  hand-rolling one: `@shadow-library/common/testing`, `@shadow-library/modules/testing`
  (`FakeDatabaseService`, `FakeStorageService`, `InMemoryRedis`, `fakeDatabaseProvider`/
  `fakeStorageProvider`, `withoutStartupHooks` for a provider that should stay injected but skip its
  startup I/O), `@shadow-library/auth/testing` (`createTestIdP({ serve: false })`, `createOfflineAuth()`).
- Import the unit's own file (or a light barrel), not a module barrel that re-exports `*.module.ts` or
  controllers — that drags in a heavier, module-boundary import graph than the unit needs.
- Rubric — keep: decision logic (branching, calculations, state machines, parsing/sanitising/validation
  helpers, prompt-assembly rules, error mapping, guards/policies called directly, pure mappers with
  non-trivial shape changes). Delete/never write: CRUD passthroughs, restated constants, whole
  prompt-string snapshots, a test whose only assertion is "mock X was called with Y" with no logic in
  between, anything that needs the app container or real I/O.
- Cross-app and DB/network-backed integration behavior belongs in the root `e2e/` workspace, not an app's
  own tests — do not write an app-level substitute for it.

## `packages/*` — the ecosystem's own tests

The ecosystem packages test the DI kernel, HTTP layer and auth SDK they provide, which genuinely requires
booting a real module graph — this is exercising the framework itself, not an app built on it, so the
`apps/*` unit-only rule does not apply here:

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

## API contract generation and its own test boundary

`bun scripts/gen-api-types.ts <web-app>|--all --check` boots the paired server through its own
`src/dump-openapi.ts` entry over fakes — no Postgres, Redis, or identity provider, and no port. A new
`apps/*-server`/`apps/*-web` pair needs its own `src/dump-openapi.ts`; a new boot-time I/O hook (something
a module does in `onModuleInit`/`onApplicationReady`) needs a fake override registered there too, or the
dump entry will try to reach real infrastructure.

## What belongs where

- **This file:** conventions that hold across every workspace in this monorepo.
- **The workspace's own `package.json` and `docs/<app>.md`:** anything genuinely workspace-specific.
- **The root `e2e/` workspace:** cross-app flows against already-deployed service URLs (`E2E_*` env
  vars) — not a substitute for a workspace's own tests, and not something you drive by standing up a
  local compose deployment.

## Verification honesty

If tests could not run (missing browser install, no network, no deployed `E2E_*` targets), report that
explicitly — never imply a suite passed that was skipped.
