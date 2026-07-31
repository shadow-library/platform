# Backend reference — canonical Shadow server conventions

Load this when writing or changing backend code (controllers, services, DTOs, config, errors, DB, cache).
The shape below is the one used by the real apps (`apps/novel-forge-server`, `apps/pulse-server`,
`apps/identity-server`, `apps/web-novel-server`). Mirror it; where an existing workspace deviates in
minor style, mirror the workspace — the Non-negotiables in SKILL.md always win.

## File layout

```
src/
  main.ts              # entry: reflect-metadata, logger transports, ShadowFactory.create(AppModule).start()
  bootstrap.ts         # Config.load() calls + ConfigRecords augmentation (side-effect import)
  app.module.ts        # root @Module — imports './bootstrap', DatabaseModule, feature modules
  constants.ts
  database/            # DatabaseModule.forRoot(...) wiring + Drizzle schemas
  modules/<feature>/   # one folder per feature
    <feature>.module.ts
    <feature>.controller.ts
    <feature>.service.ts
    <feature>.dto.ts
    index.ts           # barrel
```

## Style (all Shadow workspaces)

- Kebab-case files with role suffix (`*.service.ts`, `*.controller.ts`, `*.dto.ts`, `*.module.ts`, `*.spec.ts`).
- Named exports + a barrel `index.ts` per folder. `PascalCase` types/classes, `camelCase` values,
  `UPPER_SNAKE_CASE` module constants. `interface` for object shapes, `type` for unions.
- 2-space indent, semicolons, 180-col width. Comment the *why*, never the *what*.
- Every source file (except barrels) MUST open with the section banners, in order, keeping empty ones:

```ts
/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
```

- Imports: external/npm block first, then internal (aliases + relative), separated by a blank line.
  `node:` prefix for built-ins; inline `import { type X }` for type-only imports.

## Entry files (canonical)

### `main.ts`

```ts
import 'reflect-metadata';

import { ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { AppModule } from './app.module';

if (Config.isProd()) Logger.attachTransport('console:json');
else if (Config.isDev()) Logger.attachTransport('console:pretty').attachTransport('file:json');

ShadowFactory.create(AppModule).then(app => app.start());
```

### `bootstrap.ts` — typed config

```ts
import { Config } from '@shadow-library/common';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;
    // one entry per config key, fully typed
  }
}

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });
```

Augmenting `ConfigRecords` makes `Config.get('server.port')` return `number` app-wide. `app.module.ts`
imports `./bootstrap` for its side effects. `load` options: `envKey`, `defaultValue`, `isProdRequired`
(secrets), `validateType`, `validator`, `isArray` (CSV), `allowedValues`, `transform`, `reloadable`.
Repeat `load` calls MUST pass the same options object reference (module-level const) or it throws.

### Root `app.module.ts`

```ts
import './bootstrap';

import { Module } from '@shadow-library/app';

import { DatabaseModule } from './database';
import { FeatureModule } from './modules/feature';

@Module({ imports: [DatabaseModule, FeatureModule] })
export class AppModule {}
```

The HTTP server comes from `FastifyModule.forRoot({ ... })` (usually wrapping `HttpCoreModule.forRoot()`),
imported by the module that owns your controllers. See api-catalog.md → fastify & modules for options.

## Controllers & DTOs — the thin-controller rules

A controller is a thin adapter: read typed inputs + ambient request context, call ONE service method,
return the result. All business logic lives in the service.

1. **Path params MUST be typed via DTO transforms, never hand-parsed.**

   ```ts
   // ✅ correct — *.dto.ts
   @Field(() => String, { pattern: '^\\d+$' })
   @Transform('bigint:parse')      // built-ins: int:parse, float:parse, bigint:parse, email:normalize, string:trim, strip:null
   organisationId: bigint;

   // ❌ incorrect — controller
   const id = BigInt(params.organisationId);
   ```

2. **Responses MUST be serialized by `@RespondFor(status, Dto)` — no `toResponse()`/`toItem()` mappers.**
   Return the entity (or a service result whose field names match the DTO). Only DTO-declared fields are
   emitted, so entity secrets never leak. The handler's TS return type is decoupled from `@RespondFor`'s
   schema — return native values and let the schema shape the wire.
   *Native non-JSON values (bigint, Date): class-schema itself performs NO value coercion — wire
   conversion is handled at the HTTP layer (transformers/serializer). Mirror an existing response DTO in
   the workspace for the exact pattern (e.g. `@Field(() => String)` on a bigint id, `@Transform('strip:null')`
   to omit nulls) rather than assuming automatic coercion.*

3. **Request-scoped data: ambient `Context`, always.** Extend the router's `ContextService` (via
   `context.extend()`) with typed accessors and bind that instance to a module-level `Context` through a
   **root-module** provider (the ALS-bound instance is only DI-visible at the root). Handlers and
   services then call `Context.getSession()` etc. directly — MUST NOT inject the request/context as a
   handler parameter for this purpose. (The legacy `@Ctx` param decorator was removed from `fastify`'s
   v2 line — it no longer exists; migrate any remaining usage to the ambient pattern.)
   Caveat: do NOT globally augment the shared `ContextExtension` interface — the `@shadow-library/auth`
   SDK augments it too (`getAuthPrincipal()`/`getAuthPrincipalOrNull()`) and `extend`'s signature would
   force every extender to satisfy the union; type the bound instance locally instead.

4. **Auth declared on the route, data-dependent auth in the service.** The SDK decorators (from
   `@shadow-library/auth/module`) are **`@Authenticated()`, `@RequireScope(...scopes)`, and
   `@RequirePermission(permission, options?)`** — usable at class or method level; class-level metadata
   deep-merges into every handler. Set the controller's dominant policy at class level and override
   exceptions per method; the merge is per-key (`deepmerge`), so a method only cleanly overrides on the
   SAME axis — a controller mixing axes keeps method-level decorators.
   The SDK's `AuthGuard` is **opt-in** (routes without auth metadata are skipped — there is no `@Auth`
   or `@Public` in the SDK). Apps wanting default-deny build it in their own auth module with a local
   `@Public()` escape hatch — follow the workspace's existing auth module (e.g. `pulse-server`'s
   `RouteGuardSentinel` + `@Public()`, or `novel-forge-server`'s `ProjectOwnershipGuard`/BOLA middleware).

5. **Status codes: `@HttpStatus(n)` (or `@RespondFor(status, Dto)`), never `reply.status(n)`.**
   204 delete included — the router auto-sends the empty body. A data-dependent status comes from the
   service throwing a typed domain error that carries the HTTP status (`ErrorCode` status factories take
   a trailing status override), never from branching on the reply. `@Res` is allowed ONLY where the
   response is genuinely hand-produced: `Set-Cookie`, redirects, XML/HTML, spec media types (e.g. SCIM).

6. **All business logic in the service.** Audit recording, notifications, validation, data-dependent
   authorization (member rank, last-owner protection, step-up) live in service methods taking a
   caller-context object (`{ session, ip }`, membership, …) pulled from `Context`.

7. **DTOs live in `<feature>.dto.ts`, never inline in the controller.**

8. **User-facing validation wording belongs on the field, via `errorMessage`.** A `@Field()` without it
   surfaces AJV's phrasing (`must NOT have fewer than 8 characters`). MUST NOT re-validate in the handler
   or the service just to raise a friendlier `ValidationError` — put the message where the rule is:

   ```ts
   // ✅ correct — *.dto.ts
   @Field({ minLength: 8, errorMessage: 'Password must be at least {limit} characters' })
   password: string;

   @Field({ minLength: 8, pattern: '\\d', errorMessage: { required: 'Password is required', pattern: 'Must contain a digit', _: 'Password is invalid' } })
   password: string;
   ```

   A string covers every failure of the field including it being absent; the object form keys messages by
   the failing JSON Schema keyword, resolving keyword → `_` → AJV default. `{placeholder}` interpolates
   the failing rule's params (`{limit}`, `{pattern}`, `{format}`, `{allowedValues}`). Errors surface as
   `ValidationError` → `fields: [{ field: 'body.address.street', msg }]`, the path resolved through nested
   DTOs and array items. **Body and `@Params` only** — query params are validated leniently (an invalid
   value is dropped or reset to its `default` and the request proceeds), so an `errorMessage` on a `@Query`
   field never fires; give optional query fields a `default` and reject in the handler when it must fail.

## Errors

- Domain failure → an entry in the app's `ErrorCode` subclass catalog, built from the **status factories**
  (`ErrorCode.badRequest/unauthenticated/forbidden/notFound/conflict/validation/unavailable/internal`,
  each with a trailing HTTP-status override): `MyCode.SOMETHING.create(data?, cause?)` / `.throw()`. Add a
  new catalog entry rather than throwing bare `Error`. Group codes by aggregate with stable prefixes.
- Invariant/infra failure → `AppError.internal(reason, cause?)` — ALWAYS attach the caught error as `cause`.
- Field-level input errors → `ValidationError`.
- Generic HTTP errors → `ServerErrorCode.S001`–`S010` (`.throw()` / `.create()`) from `fastify`.
- Convert SDK/external errors to app errors before surfacing. Cross-service: `AppError.is(error, match?)`
  narrows, `AppError.from(wireObject)` rehydrates an error received over the wire.
- Nonexistent symbols — MUST NOT import: `InternalError`, `NeverError`, `ServerError`, `APIError`,
  `HttpErrorCode`, `CloudWatchTransport`.

## Authentication & authorization (`@shadow-library/auth`)

**Load `references/auth.md` before doing anything with auth.** Every Shadow app is a *first-party*
application and uses the app-session flow; the summary below is orientation only.

- `AuthModule.forRoot()` (`/module` subpath) inside `FastifyModule.forRoot({ imports: [...] })` is the
  entire integration. It provides `AuthClient`, the `AuthGuard` middleware, **and** the browser-facing
  login/callback/logout/session/step-up routes. A service writes no auth code — only `AUTH_*` env vars.
- Protect routes with `@Authenticated()` / `@RequireScope(...)` / `@RequirePermission(...)` /
  `@RequireElevation()`. Read the caller via the ambient context: `getAuthPrincipal()` /
  `getAuthPrincipalOrNull()`. The principal resolves from a bearer token *or* the session cookie —
  handlers never branch on which.
- MUST NOT hand-write a login route, a session cookie, or a token cache, and MUST NOT use
  `RelyingParty` (`/rp`) — that is for third-party/SPA clients, and a Shadow app is neither.
- Specs: use `createTestSigner` / `createTestIdP` from `@shadow-library/auth/testing` — never hand-roll
  token fixtures. Full surface: api-catalog.md → auth.

## Database & cache

- `DatabaseModule.forRoot/forRootAsync`; inject `DatabaseService`. Postgres via
  `PostgresConfig.factory(drizzleConfig, connection)`; type the client by augmenting `DatabaseRecords`.
- Every DB call SHOULD go through `databaseService.run(operation)` with a `constraintErrorMap`
  (constraint name → domain error) configured, so constraint violations surface as domain errors —
  no `try/catch` at call sites. **`web-novel-server` is a deliberate exception**: it drives the Drizzle
  client directly (no `run()`/`constraintErrorMap` wrapper) — follow whichever pattern the workspace
  you're in already uses; don't mix the two within one module.
- Caching: inject `CacheService` (`CacheModule`). Default read path is `getOrSet(key, factory, ttl?)`
  (cache-aside + single-flight stampede protection) — SHOULD prefer it over manual get/set. Counters →
  `incr`/`decr`. Pure in-memory → `LRUCache`/`InMemoryStore` from `common`.
- List endpoints: build DTOs with `PaginationQuery(SortByEnum, defaults?)` and `Paginated(ItemDto)` from
  `modules` — MUST NOT hand-write pagination DTOs.

## Service-to-service calls

Use `APIRequest` from `common` with a `svc://<service>/<path>` URL — MUST NOT hard-code hostnames.
Resolution: `svc://name/…` → `http://name/…` via cluster DNS; dotted host = cross-namespace;
`SERVICE_DISCOVERY_SCHEME` sets the scheme; `SERVICE_URL_<NAME>` overrides one service for local
dev/out-of-cluster (verbatim if it carries `scheme://`, else the discovery scheme is applied).

## Logging

`Logger.getLogger(namespace, label)` per class; message + structured metadata object, never string
concatenation. Sensitive fields → `Logger.getRedactor([...])` / `@Sensitive` on DTO fields with
`maskSensitiveData`.
