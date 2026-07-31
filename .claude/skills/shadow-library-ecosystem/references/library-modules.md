# Library-module reference — patterns for reusable/configurable modules

Load this when authoring a reusable or configurable module: an ecosystem package (`packages/*`), or an
app-local `forRoot`-style dynamic module. These are the patterns `@shadow-library/modules` maintains.

## Dynamic modules

- A configurable module MUST expose `static forRoot(options)` and, when options need DI,
  `static forRootAsync({ imports?, inject?, useFactory })`, with `forRoot` as sugar:
  `return this.forRootAsync({ useFactory: () => options });`
- Options are provided under a module-scoped `Symbol` token (declared in `*.constants.ts`) and injected
  with `@Inject(TOKEN)`. The async options type is a per-module alias (`CacheModuleAsyncOptions`,
  `DatabaseModuleAsyncOptions`, …).
- The dynamic module's `providers` and `exports` are the module's services.
- A module with rich defaults (e.g. `HttpCoreModule`) SHOULD take `PartialDeep<Options>` and deep-merge
  over secure defaults instead of requiring full options.

## Register-pattern config

- A library module MUST NOT call `Config.load` at import time. Instead:
  - declare a `DEFAULT_CONFIGS` const in `*.constants.ts`
    (`as const satisfies Partial<Record<keyof ConfigRecords, ConfigOptions>>`),
  - augment `ConfigRecords` in its `*.types.ts`,
  - resolve each key lazily at the point of use with `Config.register(key, DEFAULT_CONFIGS[key])`.
- Resolution precedence is always:
  **explicit option ?? registered config (env) ?? environment-based fallback**
  (e.g. openapi defaults on in dev; helmet/compress/health on in prod).

## Optional heavy dependencies

- Heavy drivers (`ioredis`, `memcached`, `drizzle-orm`, `@fastify/cookie`, …) MUST be
  `peerDependenciesMeta`-optional and loaded with `await import(...)` only when the feature is enabled.
- A failed import MUST throw an `AppError` that names the package and the runtime-appropriate install
  command (`bun add …` vs `npm install …` via `Config.getRuntime()`) and carries the original error as
  `cause`.

## Errors at the module boundary

- Invariant/infra failures → `AppError.internal(reason, cause?)` — always attach the caught error as
  `cause`. Domain failures → an `ErrorCode` catalog entry (`.create()`/`.throw()`).
- Map infrastructure failures to domain errors in ONE place (`translateError` + `constraintErrorMap`
  pattern) and give callers a wrapper (`run()`) so no call site needs try/catch.

## Logging

- One `LOGGER_NAMESPACE = '@shadow-library/<pkg>/<area>'` constant per area;
  `Logger.getLogger(LOGGER_NAMESPACE, 'ServiceName')` per class.

## DX first

Ship the *pattern*, not just the primitive: alongside `get/set` provide `getOrSet` with stampede
protection; alongside `translateError` provide `run()`. If consumers would write the same 4-line
wrapper at every call site, that wrapper belongs in the module.

## Internal distribution, not publishing

A reusable module lives at `packages/*` as `type: library` (or `component` if it ships CSS Modules) —
see `references/repository-setup.md` for the build. Nothing here is published to npm: `apps/*` consume
it via a `"workspace:*"` dependency, which always resolves to the package's current source (built by CI
before each app is verified). There is no version to bump, no dist-tag, and no release step — a change
to a module ships the instant its consumers are updated in the same change (AGENTS.md "Working across
workspaces"). Tests follow `references/testing.md`.
