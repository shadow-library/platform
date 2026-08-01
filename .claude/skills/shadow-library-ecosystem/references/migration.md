# Migration reference — adopting the ecosystem in an existing workspace

For a workspace that qualifies for this skill but doesn't use the packages, or uses them only partially
(a brand-new `apps/*` workspace bootstrapped from scratch, or an existing one with a deliberate gap —
see `references/backend.md` for a real example: `web-novel-server` intentionally skips the
`run()`/`constraintErrorMap` wrapper and drives Drizzle directly). **Migrate one concern at a time and
verify after each stage.** MUST NOT rewrite the whole workspace at once — each stage below leaves it in
a working state.

## Before you start

1. Confirm the skill's activation gate holds (SKILL.md §Activation).
2. Inventory what's hand-rolled and map each finding to its replacement:

| If the workspace currently… | Replace with |
| --- | --- |
| reads `process.env.X` directly | `Config.load` + `Config.get` (`common`) |
| uses `console.log`/`winston`/`pino` directly | `Logger` (`common`) |
| throws bare `new Error()` / ad-hoc error objects | `AppError`+`ErrorCode` / `ValidationError` (`common`); generic HTTP via `ServerErrorCode` (`fastify`) |
| `new Service()` / manual singletons / a custom container | `@Injectable` + `@Module` + `ShadowFactory` (`app`) |
| Zod/Joi/Yup/hand-written JSON schemas for DTOs | `@Schema`/`@Field` classes (`class-schema`) |
| raw Fastify/Express routes | `@HttpController` + route/param/response decorators (`fastify`) |
| manual helmet/cors/compression/swagger/health wiring | `HttpCoreModule.forRoot` (`modules/http-core`) |
| hand-written login/callback/logout routes, a session cookie holding a JWT, a bespoke token cache, or `RelyingParty` used directly | `AuthModule.forRoot()` + `AUTH_*` env — deletes all of it (`references/auth.md`) |
| hand-managed `pg`/`ioredis`/`memcached` clients | `DatabaseModule` + `DatabaseService` (`modules/database`) |
| ad-hoc in-process cache + Redis calls | `CacheModule`/`CacheService` (`modules/cache`) |
| a bespoke React component set / Tailwind | `@shadow-library/ui` components + `--sh-*` tokens |
| a bespoke fetch wrapper / error type in the web app | `APIRequest`/`ApiError`/`call()` (`web`) |
| a hand-rolled TanStack Router+Query setup | `createAppRouter` (`web/router`) |
| a custom Bun/Node static+SSR server | `serve` (`web/server-entry`) |
| hand-rolled service worker / manifest / IndexedDB cache | `web/pwa`, `web/service-worker`, `web/offline` |
| hand-rolled build/lint/commit-msg scripts, per-workspace `.prettierrc.json`/`commitlint.config.*`, a leftover `.shadowrc.json` | the root `scripts/` tooling + the root tool configs (`references/repository-setup.md`) |

3. Add the `workspace:*` dependencies you'll need — this is a one-line `package.json` edit plus
   `bun install`, not an install command: backend usually all five (`common`, `app`, `class-schema`,
   `fastify`, `modules` — plus `auth` for token verification/guards); web: `ui` and `web`. There is no
   dist-tag or version to pick — every internal dependency in this monorepo is `"workspace:*"`, always
   resolving to the package's current source. Ensure `reflect-metadata` is present and
   `experimentalDecorators`/`emitDecoratorMetadata` are on in `tsconfig.json`.

## Backend migration — staged

### Stage 1 — Config
- Create `src/bootstrap.ts` (`ConfigRecords` augmentation + one `Config.load` per env var); import it
  for side effects at the top of `app.module.ts` (or `main.ts` if no module yet).
- Replace every `process.env.X` read with `Config.get('...')`. Use `isProdRequired` for secrets,
  `validateType` for numbers/booleans, `allowedValues` for enums, `isArray` for CSV lists.
- Verify: app boots and reads config; missing prod-required keys fail fast.

### Stage 2 — Logging
- In `main.ts`, attach transports (`console:pretty`+`file:json` in dev, `console:json` in prod).
- Replace `console.*` with `Logger.getLogger(namespace, label).info/warn/error/debug(msg, meta)` —
  structured metadata objects, not string concatenation. Add `Logger.getRedactor([...])` for sensitive fields.
- Verify: logs render structured; no `console.*` remains.

### Stage 3 — Errors
- Define an `ErrorCode` subclass with domain codes; throw via `.create()`/`.throw()`. Use
  `ValidationError` for field-level input errors. Convert caught SDK/external errors into app errors
  before surfacing.
- Verify: errors carry codes/types; the HTTP error handler maps them consistently.

### Stage 4 — DI & modules (largest stage — go module by module, app runnable between each)
- Turn services into `@Injectable()` classes; stop `new`-ing them. Group related providers/controllers
  into feature `@Module`s, `exports` what other modules need.
- Create the root `app.module.ts`; bootstrap with `ShadowFactory.create(AppModule).then(a => a.start())`
  in `main.ts` (`import 'reflect-metadata'` first). `useFactory`/`forwardRef` for dynamic/circular
  construction; init/teardown into `OnModuleInit`/`OnModuleDestroy`.
- Verify: `app.get(Service)` resolves; lifecycle hooks fire; graceful shutdown works.

### Stage 5 — HTTP layer
- Convert DTOs to `@Schema`/`@Field` classes in `*.dto.ts`; routes to `@HttpController` classes with
  route/param decorators + `@RespondFor(status, Dto)`; `@Transform` for coercion/normalization.
  Register controllers via `FastifyModule.forRoot({ controllers, imports: [HttpCoreModule.forRoot({...})] })`.
- Replace request-scoped globals with `ContextService`; middleware → `@Middleware({ type, weight })` classes.
- Verify: endpoints validate/serialize per schema; OpenAPI docs + health probes respond.

### Stage 6 — Data & cache
- Wire `DatabaseModule.forRoot({ postgres: { factory }, redis, memcache })`; inject `DatabaseService`;
  augment `DatabaseRecords`; route constraint violations through `constraintErrorMap` + `run()` — unless
  the workspace deliberately follows a direct-client pattern instead (document the deviation, don't mix
  the two styles within one module).
- Wire `CacheModule.forRootAsync({ imports: [DatabaseModule], useFactory })`; inject `CacheService`.
- Verify: startup connection checks pass; cache L1/L2 behave.

### Stage 7 — Tooling
- Adopt the root tooling: **delete** the workspace's own `verify`/`build`/`check-migrations`/
  `generate:api-types` scripts — those now run from the repo root by path
  (`bun scripts/verify.ts <workspace>`, `bun scripts/build.ts <workspace>`, …). Keep only what is
  genuinely the workspace's own (`type-check`, `test`, `dev`, `db:*`). Remove any hand-rolled
  scripts/configs and any leftover `.shadowrc.json` (that format no longer exists — non-inferable build
  inputs go in a `"shadow"` key in the workspace's `package.json`). Do not add a workspace-local
  `.prettierrc.json` or `commitlint.config.*` — the root ones cover every workspace; a workspace
  `eslint.config.ts` *is* allowed, but only where the workspace genuinely deviates from the root lint
  config. Per `references/repository-setup.md`, husky hooks live once at the repo root; don't wire
  per-workspace hooks.

## Web migration — staged

### Stage 1 — UI
- `import '@shadow-library/ui/styles.css'` at the root; `ThemeProvider` + inline `themeInitScript()` in
  `<head>`. Replace bespoke components with `ui` equivalents; ad-hoc styling with `--sh-*` tokens and
  utility classes. Remove Tailwind/CSS-in-JS. Mount `<Toaster />`/`<BannerOutlet />` at root.
- Verify: theming (light/dark/compact) works; no hydration mismatch (SSR apps).

### Stage 2 — Transport & error model
- Replace the bespoke fetch wrapper with `APIRequest` (browser) / `call()` + `createServerFetch`
  (server functions). Adopt `ApiError`/`ErrorResponse` as the single error surface. Optionally
  `generateApi(specUrl)` for a typed client.
- Verify: one error contract flows backend → UI.

### Stage 3 — Router & SSR (highest-value partial-adoption fix; SSR apps only — a `type: spa` workspace
like `pulse-web` has no router-owned SSR/QueryClient concern to migrate, just the router+query wiring)
- Replace hand-rolled `getRouter()` (per-request QueryClient + `setupRouterSsrQueryIntegration`) with
  `createAppRouter(routeTree, { router: { defaultErrorComponent } })`. Use `requireAuth(...)` in
  `beforeLoad` for gated routes and `useSearchParams()` for query state.
- Verify: SSR renders, per-request cache isolation holds, auth redirects work.

### Stage 4 — Production server
- Replace a custom static+SSR server with `serve({ ssrEntry, clientDir })` (`web/server-entry`).
- Verify: static assets cached, SSR streams, liveness probe + graceful drain work.

### Stage 5 — PWA & offline (optional)
- Manifest via `buildManifest(...)` + `pwaHeadLinks`/`pwaHeadMeta`; worker registration via
  `registerServiceWorker`/`useServiceWorker` (prompt-then-reload via `updateAvailable`/`applyUpdate()`);
  `usePwaInstall`/`useOnlineStatus` for install/offline UI.
- Replace a hand-rolled service worker with a 3-line `src/sw.ts` calling `createServiceWorker(...)`
  emitted to `/sw.js`; move ad-hoc caching into its `runtimeCaching` rules.
- Replace bespoke IndexedDB/localStorage caches with `OfflineStore`/`useOfflineDownload`, and/or
  persist the query cache with `createIDBPersister`.
- Verify: installs, updates prompt-then-reload, offline navigation serves the fallback, downloaded
  content reads back offline.

## Partial-adoption checklist

When a workspace already uses *some* of the ecosystem, look specifically for these gaps and close them:

- [ ] `process.env` still read directly anywhere → `Config` + `ConfigRecords`.
- [ ] Any `console.*` left → `Logger`.
- [ ] Services constructed with `new` outside factories → DI providers.
- [ ] DTOs validated with a non-`class-schema` library → `@Schema`/`@Field`.
- [ ] Web app hand-rolling `getRouter`/server-fetch/prod-server → `web/router`, `web/server`, `web/server-entry`.
- [ ] Hand-rolled service worker / manifest / offline cache → `web/pwa`, `web/service-worker`, `web/offline`.
- [ ] Manual helmet/cors/health/openapi → `HttpCoreModule`.
- [ ] Hand-rolled build/lint/commit-msg scripts, a workspace-local `.prettierrc.json`, or a leftover
      `.shadowrc.json` → the root `scripts/` tooling, run from the repo root.

## Guardrails

- Keep the file/section-banner conventions (`references/backend.md` §Style) as you touch each file.
- MUST NOT mix paradigms in the same layer (half DI, half manual singletons) longer than one stage.
- Preserve public API/route shapes during migration; refactor internals, not contracts.
- After each stage: typecheck, run the app, exercise the touched path before moving on.
