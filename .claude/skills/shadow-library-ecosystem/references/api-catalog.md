# Shadow Library — full API catalog (symbol-accurate)

This is the search target of workflow step 4 (SKILL.md): before creating any utility, helper, wrapper,
or component, search here first — if a public export covers the need, use it.

Derived by resolving each package's barrel graph from its entry point(s) directly in this monorepo
(`packages/*/src`), verified against source 2026-07-31. There is no install step and no dist-tag to
check — every consumer is a `workspace:*` dependency in the same repo. Trust the symbols below over
the `version` field in each package's `package.json`; those are frozen leftovers from the pre-monorepo
history and don't move.

Conventions: **`Exports:`** lines are the exhaustive public symbol list (types included). If a symbol
isn't listed, it isn't public — don't deep-import it. Packages have **no hand-written `exports`
map** in source `package.json` for the `library`/`component` packages here — `shadow build` synthesizes
it into `dist/package.json` from `.shadowrc.json` `build.exports`.

---

## @shadow-library/common — foundation

Root entry (`src/index.ts`, loads `reflect-metadata`, re-exports everything below) **plus 8 real
subpaths** (`.shadowrc.json` `build.exports`, mirrored in `package.json` `exports`). Engines: node >= 23.

### Config — root or `./config`
Exports: `Config` (singleton), `ConfigService`, `ConfigRecords`, `ConfigOptions`, `ConfigKey`, `ConfigChangeCallback`, `NodeEnv`, `LogLevel`, `Runtime`.
- `Config.get(key)` / `getOrThrow` / `load(key, options)` / `register(key, options)` (= load+get) / `loadOrExit(key, options)` (resolve-or-`process.exit(1)`) / `setLogger(logger)`.
- `Config.isDev()/isProd()/isTest()/getRuntime()` (node/edge/deno/browser/bun); `subscribe(key, cb)` (prefix-matching); `enableHotReloading()/disableHotReloading()` (chokidar); env files via `ENV_FILES` (comma-separated).
- `ConfigOptions`: `envKey`, `isProdRequired`, `validateType` (`'number'|'integer'|'boolean'`), `validator`, `isArray`, `defaultValue`, `allowedValues`, `transform`, `reloadable`. Re-`load` of a key with a **different options object reference** throws (outside test env; same reference = no-op) — use a module-level const.
- Type every key by augmenting `interface ConfigRecords` via `declare module '@shadow-library/common'`.

### Logger & transports — root or `./logger`
Exports: `Logger` (singleton, class `LoggerStatic`; a `Logger` *interface* type is also exported under the same name), `LogData`, `redactFn`, `AttachableTransports`, `ContextProvider`, `ConsoleTransport`, `FileTransport`, `FileTransportOptions`, `format` (winston's, augmented with `.brief()`), `Format`, `BriefFormatOptions`.
- `Logger.getLogger(namespace, label)` (label required in the string overload) or `getLogger(metadataObject)` → `.verbose/.debug/.http/.info/.warn/.error(msg, meta?)`. Never `console.*`.
- `attachTransport(type)`: `'console:pretty' | 'console:json' | 'file:json'` — chainable. **No CloudWatch transport exists.**
- Also: `isDebugEnabled()`, `setDefaultMetadata`, `setLogMetadataProvider`, `addContextProvider(ns, fn)`, `getRedactor(paths, censor?)` (fast-redact), `addTransport`, `addDefaultTransports`, `close`.

### Errors (unified API) — root or `./errors`
Exports: `ErrorCode`, `AppError`, `AppErrorObject`, `SerializedAppError`, `ValidationError`, `ValidationErrorObject`, `FieldError`. **`FlowErrorCode` is root-only** — it does not live under `./errors` (it's defined alongside `Task`/`Flow` in `src/classes/`, not `src/errors/`).
- `ErrorCode` — subclass to build a domain catalog using the **static status factories**: `badRequest`(400) / `unauthenticated`(401) / `forbidden`(403) / `notFound`(404) / `conflict`(409) / `validation`(422) / `unavailable`(503) / `internal`(500), each accepting a trailing HTTP-status override. Every code offers **`.create(data?, cause?)`** / **`.throw(data?, cause?)`**.
- Shared codes on `ErrorCode` itself: `UNKNOWN`, `VALIDATION`, `INTERNAL`, `API_REQUEST_FAILED` (500), `API_REQUEST_TIMEOUT` (504), `API_REQUEST_NETWORK_ERROR` (503), `SERVICE_UNKNOWN` (500).
- `AppError`: `AppError.internal(reason, cause?)` for invariant/infra failures (always pass the caught error as `cause`); `AppError.is(error, match?)`; `AppError.from(wireObject)` (rehydrate across a process boundary, fails closed to internal); `.toObject()` → `SerializedAppError` (adds `status`+`isInternal`); `.toResponse()` (masks internals to `UNKNOWN`).
- `ValidationError` (AppError subclass): `combineErrors(...)`, `addFieldError`, `getErrors(withDetails?)`, `getErrorCount`, `getSummary`, field-aware `toObject`/`toResponse`.
- **Do not import — these do not exist:** `InternalError`, `NeverError`, `APIError`, `HttpErrorCode`, `CloudWatchTransport` (and `fastify`'s `ServerError`).

### Caching (in-memory) — root or `./cache`
Exports: `LRUCache`, `LRUCacheOptions`, `InMemoryStore`, `GlobalStore`.
- `new LRUCache(capacity, { ttl? })` — `.get/.set/.peek/.has/.remove/.clear`. `InMemoryStore` (+ `GlobalStore` singleton) — `.set/.get/.del/.insert/.remove/.inc`.

### Task & flow orchestration — root only (no dedicated subpath)
Exports: `Task`, `ITask`, `TaskManager`, `TaskManagerOptions`, `RetryCallback`, `RollbackFn`, `ShouldRetryFn`, `FlowManager`, `FlowRegistry`, `FlowDefinition`, `FlowState`, `FlowStateDefinition`, `FlowStatus`, `ContextUpdater`, `ActionResult`, `FlowErrorCode`.
- `Task.create(fn)` chain: `.name/.retry/.delay/.backoff/.onRetry/.shouldRetry/.rollback/.execute/.executeRollback`. `TaskManager.create({ name, rollbackOnError })` → `.addTask/.getResult/.execute`. `FlowManager` (typed state machine) + `FlowRegistry` (registry, snapshot restore).

### HTTP client & service discovery — root or `./http`
Exports: `APIRequest`, `APIResponse`, `APIRequestOptions`, `CustomAPIRequest`, `BodyFormat`.
- Static factories `APIRequest.get/post/put/patch/delete(url)` (constructor is private); chain `.header/.query/.field` (dot-path nesting) `/.body/.timeout(ms)` (total budget) `/.suppressErrors/.child()` (returns a `CustomAPIRequest`) `/.execute<T>()`; thenable.
- Failure taxonomy: HTTP >= 400 → `ErrorCode.API_REQUEST_FAILED` (`{status, response}`); timeout → `API_REQUEST_TIMEOUT` (thrown even under `suppressErrors()`); transport/DNS/TLS failures → `API_REQUEST_NETWORK_ERROR` (original error as `cause`).
- **Service discovery** (`APIRequest` calls this internally; also usable standalone — **root export only, no dedicated subpath**): `ServiceDiscovery` (singleton) / `ServiceDiscoveryService` — `.getUrl(service)` / `.resolve(url)`. A `svc://<service>/<path>` URL resolves to `http://<service>/<path>` via cluster DNS (any other URL passes through). Dotted host (`svc://pulse-server.prod/…`) targets another namespace. `SERVICE_DISCOVERY_SCHEME` overrides the scheme (default `http`); `SERVICE_URL_<NAME>` (name upper-cased, `-`/`.` → `_`) overrides one service — used verbatim if it carries `scheme://`, else the discovery scheme is applied. Bad name/override → `ErrorCode.SERVICE_UNKNOWN`.

### Reflection — root or `./reflect`
Exports: `Reflector` (singleton, class `ReflectorService`), `UpdateMetadataOptions` — `defineMetadata/getMetadata/hasMetadata/appendMetadata/prependMetadata/updateMetadata(...,{arrayStrategy})/cloneMetadata`.

### Interfaces & shared types — root or `./interfaces`
Exports: `DotNotation`, `Fn`, `SyncFn`, `AsyncFn`, `AsType`, `SortOrder`, `PaginationMode`, `OffsetPagination`, `PagePagination`, `CursorPagination`, `OffsetPaginationResult`, `PagePaginationResult`, `CursorPaginationResult`, `PaginationResult`, `NormalizedPagination`, `PrimitiveValue`, `SyncValue`, `MaybeArray`, `MaybeNull`, `MaybeUndefined`, `Nullable`, `MaskOptions`.

### Utils, shorthands — root or `./utils` (facade only)
Exports: `utils`, and — **root-only, no dedicated subpath** — `throwError`, `tryCatch`, `withThis`, `TryResult`.
- Only the aggregate `utils` facade is public under `./utils` (`utils.string`, `utils.object`, `utils.temporal`, `utils.pagination`, `utils.isValid`) — the per-area util instances are file-local and never separately exported. `tryCatch(fn)` → `{success,data}|{success,error}` (sync+async); `withThis(fn)`; `throwError(err): never`.

---

## @shadow-library/class-schema — decorator → JSON Schema

Single root entry; no subpaths.

Exports (values): `Schema`, `Field`, `FieldMetadata`, `Integer`, `ClassSchema`, `EnumType`, `SchemaComposer`, `SchemaRegistry`, `TransformerFactory`, `PartialType`, `PickType`, `OmitType`.
Exports (types): `ReturnTypeFunc`, `SchemaOptions`, `ClassSchemaOptions`, `SchemaClass`, `ParsedSchema`, `JSONSchema`, `JSONSchemaType`, `TypeOf`, `Transformer`, `TransformerAction`, `TransformerContext`, `FieldFilter`, `FieldSchema`, `AnyFieldSchema`, `BaseFieldSchema`, `StringFieldSchema`, `NumberFieldSchema`, `BooleanFieldSchema`, `ArrayFieldSchema`, `ObjectFieldSchema`, `EnumFieldSchema`.

**`cloneClassSchema` is NOT public** — it exists in `type-helpers/mapped-types.utils.ts` and is used
internally by `PartialType`/`PickType`/`OmitType` to implement themselves, but the `type-helpers` barrel
never re-exports it. Don't import it; if you need to clone a schema, use `PartialType`/`PickType`/`OmitType`.

- `@Schema(options?)` / `@Field(options?)` or `@Field(typeFn, options?)` (`() => String`, `() => [Tag]`, `() => Integer`, `() => SomeEnumType`). `@FieldMetadata({...})` attaches custom metadata read by transformers.
- Unknown `@Field()` options are copied verbatim into the property schema, which is how consuming packages contribute their own keys — `@Field({ errorMessage })` is declared by `fastify`, **not** here (see its section). This package stays a pure JSON Schema generator and gives such keys no meaning.
- `ClassSchema.generate(Class)` → branded `ParsedSchema`; `ClassSchema.isBranded`. `SchemaRegistry` (`addSchema/getSchema`); `SchemaComposer.{anyOf,oneOf,discriminator(key, ...Classes)}` (all static); `EnumType.create(name, values, options?)` / `.toSchema()`; `PartialType/PickType/OmitType` derive DTOs.
- `TransformerFactory` is a class constructed with a `FieldFilter`: `.hasTransformableFields/.maybeCompile/.compile` — pure code-gen walking a branded schema and invoking a caller-supplied `TransformerAction`. **class-schema itself performs no value coercion** — there is no bigint/Date serialization in this package; the runtime type map is exactly `String/Number/Boolean/Integer/Object/Array`. Wire coercion of native values is the HTTP layer's job (transformers) — mirror an existing DTO in your repo for bigint/Date handling.

---

## @shadow-library/app — DI kernel

Single root entry; no subpaths.

Exports (values): `ShadowFactory` (singleton instance), `ShadowFactoryStatic`, `ShadowApplication`, `Module`, `Injectable`, `Controller`, `Handler`, `Inject`, `Optional`, `UseInterceptors`, `UseInterceptor`, `SetMetadata`, `EnableIf`, `applyDecorators`, `forwardRef`, `createContextId`, `InjectionToken`, `ModuleRef` (abstract), `Dispatcher` (abstract).
Exports (types): `ShadowApplicationOptions`, `ModuleMetadata`, `DynamicModule`, `Import`, `InjectableOptions`, `InjectMetadata`, `ControllerMetadata`, `HandlerMetadata`, `HandlerDescriptor`, `DispatchMetadata`, `EnableIfCondition`, `ForwardRef`, `ForwardReference`, `ContextId`, `Provider`, `ClassProvider`, `ValueProvider`, `FactoryProvider`, `AliasProvider`, `ClassToken`, `ProviderToken`, `TokenValue`, `FactoryDependency`, `Interceptor`, `InterceptorConfig`, `InterceptorContext`, `CallHandler`, `OnModuleInit`, `OnModuleDestroy`, `OnApplicationReady`, `OnApplicationStop`.

**`isClassProvider`, `isValueProvider`, `isFactoryProvider`, `isAliasProvider`, `getProviderToken` are
NOT public.** They're real functions in `injector/helpers/provider-classifier.ts`, but root `src/index.ts`
cherry-picks only `ModuleRef` out of the injector barrel — it does not re-export the rest of `injector/`.
They're DI-internal (consumed by the module registry/instance-wrapper machinery); don't deep-import them.

- Naming is `Handler`/`Dispatcher` (there are no legacy `Route`/`Router` symbols — do not reference them).
- Bootstrap: `ShadowFactory.create(AppModule, options?)` → already-initialized `ShadowApplication` (`init/start/stop/isInitiated`, `get(token)`, `select(module)` → `ModuleRef`). Options: `enableShutdownHooks?: false | NodeJS.Signals[]` (default `['SIGINT','SIGTERM']`) and **`overrides?: Provider[]`** — swap providers by token (test-oriented).
- DI: class shorthand / `ClassProvider` / `ValueProvider` / `FactoryProvider(useFactory, inject)` / `AliasProvider(useExisting)`; `forwardRef` for cycles; `DynamicModule` for `forRoot/forRootAsync`; `ModuleRef.get` + `.resolve(typeOrToken, contextId?)` for transient scope; `@Injectable({ transient? })`.
- Interceptors: `Interceptor.intercept(ctx: InterceptorContext, next: CallHandler)` — `ctx.getClass/getMethodName/getArgs/isPromise`. `Dispatcher` abstract (`register(DispatchMetadata[])`/`start`/`stop`) is the token HTTP layers bind to.
- Lifecycle order: `onModuleInit` (leaf→root) → controllers registered → `onApplicationReady` → … → `onApplicationStop` → dispatchers stopped → `onModuleDestroy`. Class-level handler metadata deep-merges (deepmerge) into method-level metadata during registration.

---

## @shadow-library/fastify — decorator HTTP layer (ESM-only)

Single root entry. `FastifyRouter extends Dispatcher` and is bound to app's `Dispatcher` token.
Peers: `app`/`class-schema`/`common`/`reflect-metadata` required; `@fastify/cookie`, `@fastify/view` **optional** (lazily imported).

Exports: `FastifyModule`, `FastifyRouter`, `FastifyModuleOptions`, `FastifyModuleAsyncOptions`, `FastifyConfig`, `FASTIFY_INSTANCE`, `HttpController`, `HttpRoute`, `HttpInput`, `Get`, `Post`, `Put`, `Patch`, `Delete`, `Options`, `Head`, `All`, `Version`, `Body`, `Params`, `Query`, `Headers`, `Cookie`, `RawBody`, `Req`, `Request`, `Res`, `Response`, `RespondFor`, `HttpStatus`, `Header`, `Redirect`, `Render`, `ApiOperation`, `Transform`, `Sensitive`, `Middleware`, `ContextService`, `ContextExtension`, `ServerErrorCode`, `DefaultErrorHandler`, `ErrorHandler`, `ErrorResponseDto`, `ErrorFieldDto`, `DevErrorResponseDto`, `CustomTransformers`, `InbuiltTransformers`, `TransformOptions`, `TransformerFn`, `TransformTypes`, `SensitiveDataType`, `HttpMethod` (enum), `RouteInputType` (enum), `HttpRequest`, `HttpResponse`, `HttpCallback`, `RouteHandler`, `AsyncRouteHandler`, `CallbackRouteHandler`, `RouteOptions`, `RouteInputSchemas`, `ApiOperationMetadata`, `MiddlewareType`, `MiddlewareOptions`, `MiddlewareMetadata`, `MiddlewareGenerator`, `AsyncHttpMiddleware`, `CallbackHttpMiddleware`, `RequestContext`, `CookieValues`, `RequestMetadata`, `ChildRouteRequest`, `DynamicRender`, `ParsedFastifyError`, `ServerInstance`, `ServerMetadata`, `FieldErrorMessage`.
(The `Ctx` param decorator was **removed in `fastify@2.0.0-alpha.1`** — it no longer exists; use the ambient `Context` pattern instead. There is no `ServerError` class — confirmed absent from source.)

- Module: `FastifyModule.forRoot(opts)` / `forRootAsync({useFactory,inject,imports})`. `FastifyModuleOptions`: `controllers`, `providers`, `imports`, `exports`, `fastifyFactory` + `FastifyConfig`: `host`, `port`, `errorHandler`, `maskSensitiveData` (default `Config.isProd()`), `routePrefix`, `prefixVersioning`, `responseSchema`, `enableChildRoutes`, `childRouteHeaders`, `transformers`, `cookie` (forwarded to `@fastify/cookie`, e.g. `secret`); plus everything inherited from Fastify's `FastifyServerOptions` (`requestIdLogLabel`, `genReqId`, `routerOptions`, `ajv`, …). Dev config keys: `app.dev.delay` (int), `app.dev.stack-trace` (bool, default dev).
- Route decorators: `@Get/@Post/@Put/@Patch/@Delete/@Options/@Head/@All(path?)`, `@Version(n)`; low-level `@HttpRoute`/`@HttpInput`.
- Param decorators: `@Body/@Params/@Query(schema?)`, `@Headers()`, `@Cookie()` (lazy optional `@fastify/cookie`; clear error if missing), `@RawBody()` (raw `Buffer`; flags the route to capture it), `@Req`/`@Request`, `@Res`/`@Response`.
- Response decorators: `@RespondFor(status, Class|[Class]|schema)`, `@HttpStatus(status)`, `@Header(name, value|() => string)`, `@Redirect(...)` (default 301), `@Render(view)` + `DynamicRender` (needs optional `@fastify/view`).
- `@ApiOperation(meta)`; `@Transform(name|{input,output})` — built-ins: `email:normalize`, `string:trim`, `int:parse`, `float:parse`, `bigint:parse`, `strip:null`; custom via `FastifyConfig.transformers` + `CustomTransformers` augmentation. `@Sensitive(type?)` (`'secret'|'email'|'number'|'words'`) or `@Sensitive(maskOptions)` — redacted when `maskSensitiveData` is on.
- `@Middleware({type, weight})` on a class (`use(req, reply, done)` or `generate(routeMeta)` for route-aware middleware).
- `ContextService`: `getRequest/getResponse/getRID(throwOnMissing?)`, `set/get`, `setInParent/getFromParent/resolve`, `isInitialized/isChildContext`, `extend({...})` + `ContextExtension` augmentation.
- Errors: `ServerErrorCode` catalog `S001`–`S010` (`.create()`/`.throw()`); `DefaultErrorHandler`/`ErrorHandler`; `ErrorResponseDto`/`ErrorFieldDto`/`DevErrorResponseDto` are public — reuse for typed error responses.
- **Custom validation messages** — this package contributes an `errorMessage` option to class-schema's `@Field()` (declaration merge on `BaseFieldSchema`, `interfaces/field-schema.interface.ts`; type `FieldErrorMessage = string | (Record<string, string> & { _?: string })`). String form covers every failure of the field including `required`; object form keys by failing JSON Schema keyword, resolving keyword → `_` → AJV default. `{placeholder}` interpolates the rule's params (`{limit}`, `{pattern}`, `{format}`, `{allowedValues}`). Resolved for **body and params only** — querystring validation is lenient (invalid value dropped or reset to `default`, request proceeds), so messages there never fire. Failures surface as `ValidationError` with `field` as the full path (`body.address.street`, `body.tags.0`); a missing field is reported against the field, not its parent. Emitted as a top-level `errorMessage` keyword, so it **conflicts with the `ajv-errors` plugin** — use one or the other.
- Child routes/SSR: `FastifyRouter.resolveChildRoute<T>(url, headers?)` (guarded by `enableChildRoutes`; injects `x-service: internal-child-route`).

---

## @shadow-library/auth — identity SDK (first-party sessions + resource server + relying party)

Subpaths (real `exports` map in source): `.` , `./module`, `./rp`, `./testing`. ESM-only; node >= 23;
**zero runtime deps** (WebCrypto-based). Peers: `common` required; `app` + `fastify` + `class-schema`
**optional** (only needed for `./module`).

**Integration guide: `references/auth.md`.** Every Shadow app is first-party — read that file before
wiring auth into a service; this section is the symbol index only.

### `.` (root — framework-free client)
Exports: `AuthClient`, `AppSessionClient` (+ `AppSessionClientOptions`), `AppRegistryClient` (+ `AppRegistryOptions`), `ServiceAccessClient` (+ `ServiceAccessOptions`), `AccessTokenCache` (+ `AccessTokenKey`), `hashSessionHandle`, `AuthErrorCode`, `decodeJwt`, `validateClaims`, `verifyJwt`, and types `ClaimExpectations`, `DecodedJwt`, `JwtHeader`, `Jwk`, `JwtPayload`, `PrincipalKind`, `AssuranceLevel`, `AuthPrincipal`, `FetchLike`, `AuthClientCredential`, `AuthCacheOptions`, `PermissionManifest`, `RoleManifest`, `RoleCatalogManifest`, `RoleCatalogSyncResult`, `RoleCatalogSyncOptions`, `AuthClientConfig`, `ServiceAccessRule`, `DiscoveryDocument`, `ServiceTokenOptions`, `CheckPrincipal`, `CheckInput`, `CheckOptions`, `IntrospectionResult`, `LogoutTokenClaims`, `AppSession`, `AppSessionCreateInput`, `AppSessionTokenInput`, `AppSessionToken`, `AppSessionElevation`, `AppSessionOrganisation`, `SwitchedOrganisation`, `AppRegistration`, `TokenExchangeInput`, `ExchangedToken`.
- `AuthClient`: `verify` (offline **EdDSA-only** JWT verification — non-EdDSA rejected; `iss`/`aud`/`exp` always enforced, optional nonce; keys from cached remote JWKS), `verifyLogoutToken` (OIDC back-channel logout token: `events` required, `nonce` forbidden, `aud` = client id), `check`/`checkAll` (PDP permission checks — fail closed unless `failOpen`), `getServiceToken`, `exchangeUserToken` (RFC 8693 token exchange), `fetch`, `fetchService`, `syncRoles` (now takes an optional `RoleCatalogSyncOptions` with a `force` flag), `loadServiceAccess`, `refreshServiceAccess`, `isServiceCallerAllowed`, `introspect`, `revoke`, `getDiscovery`, `getAppRegistration`, `getAudience`, `getStepUpEndpoint`, `assertScopesSupported`, `stop`, and `appSessions` (an `AppSessionClient`).
- `AppSessionClient`: `createSession`, `mintToken`, `claimElevation`, `revokeSession`. All four are M2M — they carry the app's own service token with scope `app-session:manage`; a handle alone authenticates nothing.
- `AccessTokenCache`: keyed on `(handle hash, audience, elevated, scope)` so an `AAL2` token can never answer an `AAL1` lookup. `hashSessionHandle` is the **only** representation of a handle allowed outside the cookie.
- `AuthErrorCode` codes: `CONFIG_INVALID`, `ALG_REJECTED`, `AUDIENCE_MISMATCH`, `ISSUER_MISMATCH`, `KEY_UNKNOWN`, `NONCE_MISMATCH`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `DISCOVERY_FAILED`, `EXCHANGE_FAILED`, `INTROSPECTION_FAILED`, `REVOCATION_FAILED`, `APP_SESSION_FAILED`, `ELEVATION_REQUIRED`, `RESOURCE_NOT_ENTITLED`, `SCOPE_NOT_GRANTED`, `SCOPE_UNSUPPORTED`, `SESSION_INVALID`, `LOGIN_STATE_INVALID`, `LOGOUT_TOKEN_INVALID`, `REDIRECT_NOT_ALLOWED`, `PDP_UNAVAILABLE`, `ROLE_SYNC_FAILED`, `SERVICE_ACCESS_FAILED`, `TOKEN_REQUEST_FAILED`, `APP_REGISTRATION_FAILED`, `ELEVATION_INTENT_MISMATCH`, `ORGANISATION_NOT_PERMITTED`, `ROLE_SYNC_REFUSED`, `TOKEN_EXCHANGE_FAILED`, `TOKEN_EXCHANGE_REFUSED`.

### `./module` (fastify/app integration)
Exports: `AuthModule` (`forRoot(options?)`; `AuthModuleOptions`, `BrowserAuthOptions`, `AuthRoutePaths`, `ResolvedBrowserAuthConfig`, `resolveAuthClientConfig`, `resolveAuthRoutes`, `resolveBrowserAuthConfig`), `RelyingPartyModule` (`forRoot(options)`; `RelyingPartyModuleOptions`), `AppSessionService`, `AuthController` (+ `configureAuthRoutes`), the auth DTOs (including org-switching: `AuthOrganisationItem`, `AuthOrganisationsResponse`, `SwitchOrganisationBody`, `SwitchOrganisationResponse`), `AuthGuard` (+ `GuardedRequest`, `GuardedResponse`, `AuthGuardHandler`), `Authenticated`, `RequireScope`, `RequirePermission`, `RequireElevation` (+ `AuthRouteMetadata`, `RequirePermissionOptions`), cookie helpers (`parseCookies`, `serializeCookie`, `expireCookie`, `assertValidCookieName`, `CookieAttributes`, `SameSitePolicy`), login-state encoding (`encodeLoginState`, `decodeLoginState`, `LOGIN_STATE_TTL_SECONDS`, `LoginState`, `matchesState`), `SessionRegistry`, `LoginRedirect`, `LoginResult`, `TokenRequest`, `BrowserAuthRuntime`, `AUTH_PRINCIPAL` (symbol), `extendContextWithAuth`, `AUTH_ROUTE_METADATA`, `AuthGuardErrorCode`.
- **`LoginStateStore`/`InMemoryLoginStateStore`/`SealedLoginStateStore` are GONE** — the login-state design moved from a store abstraction to stateless sealed encoding (`encodeLoginState`/`decodeLoginState`). `LoginState` and `matchesState` are unchanged.
- **Decorators are `@Authenticated()`, `@RequireScope(...scopes)`, `@RequirePermission(permission, options?)`, `@RequireElevation(...scopes)`** — there is **no `@Auth` and no `@Public`** in the SDK (confirmed absent). They work class- or method-level; class-level metadata deep-merges into each handler (via app's handler-metadata merge).
- **Protection is opt-in, not default-deny:** `AuthGuard` (a `@Middleware({type:'preHandler', weight:100})` generating class) skips routes without auth metadata. An app wanting default-deny + a `@Public()` escape hatch builds that in its own auth module on top (some apps do — follow the repo).
- **`AuthModule.forRoot()` also registers the browser auth routes** (login, callback, logout, back-channel logout, session, step-up, and now organisation-switch) whenever a redirect URI and client credentials are configured. Paths are overridable via `routes`; any route may be set to `false`.
- A guarded route resolves its principal from **either** an `Authorization: Bearer` token **or** the app-session cookie, into one `AuthPrincipal`. M2M/service principals are deny-by-default (must match an admin-loaded `ServiceAccessRule`); PDP `check` fails closed unless `failOpen`.
- Context: `extendContextWithAuth(context)` (called on module init) augments fastify's `ContextExtension` with `getAuthPrincipal()` (throws 401 if absent) and `getAuthPrincipalOrNull()`. `AuthGuardErrorCode`: `IAM_001` (unauthenticated), `IAM_002` (forbidden), `IAM_003` (step-up required — the one deliberately actionable code).

### `./rp` (OIDC relying party — third-party/SPA clients only)
Exports: `RelyingParty` (+ `RelyingPartyConfig`, `AuthorizationUrlOptions`, `AuthorizationRequest`, `CodeExchangeInput`, `TokenSet`), `buildAuthorizationUrl` (+ `AuthorizationUrlInput`), `createPkcePair` (+ `PkcePair`), `randomUrlSafeString`.
- `RelyingParty.createAuthorizationUrl` (PKCE S256 + state + nonce), `.exchangeCode`, `.refresh`. Token requests are **form-encoded** (RFC 6749 §2.3.1); client secrets travel in an HTTP Basic header.
- **A first-party Shadow app MUST NOT use this** — it exchanges the code for a token pair, not an app-session handle. See `references/auth.md`.

### `./testing`
Exports: `createTestSigner` (+ `TestSigner`), `createTestIdP` (+ `TestIdP`, `TestIdPOptions`, `TestTokenInput`, `TestPrincipalRef`, `TestLogoutTokenInput`, `TestOrganisation`, `TestStepUpIntent`, `CapturedCatalog`, `CapturedTokenRequest`). Use these in specs instead of hand-rolling token fixtures.
- Mock IdP covers discovery, JWKS, token, PDP, role catalog, service access, organisation-switching **and** the app-session routes. Drivers: `issueToken`, `signToken`, `createAuthorizationCode`, `issueLogoutToken`, `setSteppedUp`, `endIdentitySession`, `getAppSessionCount`, `getLastMintRequest`, `getLastTokenRequest`, `setServiceAccess`, `grantPermission`, `rotateKeys`, `setEndpointFailure`, `getRequestCount`.

---

## @shadow-library/modules — batteries-included modules

Subpaths: `.` (everything), `./http-core`, `./database`, `./cache` (**no `/pagination` subpath** — pagination lives under http-core). Peers: `app`/`class-schema`/`common`/`fastify`/`reflect-metadata` required; `drizzle-orm`, `ioredis`, `memcached` **optional** (lazily imported; a missing one throws an `AppError` naming the runtime-appropriate install command).

### http-core
Exports: `HttpCoreModule`, `CSRFTokenService`, `HealthService`, `OpenApiService`, `Paginated`, `PaginationQuery`, and types `CSRFOptions`, `CSRFCookie`, `CSRFTokenType`, `SortOrder` (type-only: `'asc'|'desc'`), `IPagination`, `IPaginationQuery`.
- **`HttpCoreModuleOptions`, `CommonOptions`, `OpenAPIOptions` are NOT public** — they're defined in `http-core.types.ts`, but `http-core/index.ts` re-exports only `./dtos`, `./http-core.module`, `./services`, not the types file. `HttpCoreModule.forRoot(options)` still accepts the same option shape at the call site (TS infers it structurally) — you just can't name the type directly; inline the object literal or let inference carry it.
- `HttpCoreModule.forRoot(options?)` — the merge over defaults is **shallow (one level)**: nested objects like `helmet.contentSecurityPolicy` are replaced wholesale, so pass complete nested objects when overriding.
- Feature enablement `options.<feature>.enabled ?? config key ?? env default` applies to **openapi/helmet/compress** only (config keys `http-core.{openapi,helmet,compress}.enabled`; defaults: openapi on in dev, helmet/compress on in prod). **CSRF uses a `disabled` flag** (`options.csrf.disabled`): always on in prod unless disabled; non-prod gated by `http-core.csrf.enabled` (default true); only acts when the request has cookies. Health self-registers via config `health.enabled` (default on in prod) + `health.host`/`health.port` (default `localhost:8081`).
- DI note: only `CSRFTokenService` is exported for injection by consumers; `HealthService`/`OpenApiService` are internal providers.
- **Pagination builders:** `PaginationQuery(SortByEnum, defaults?)` (`SortByEnum` is your own `EnumType`; defaults: `limit` 20 [1..100], `offset` 0, `sortOrder 'asc'`, `sortBy` = first enum value) and `Paginated(ItemDto)` (`total/limit/offset/items`). Use these for list endpoints; pairs with `common`'s `utils.pagination`.

### database
Exports: `DatabaseModule`, `DatabaseService`, and types `DatabaseModuleOptions`, `DatabaseModuleAsyncOptions`, `DatabaseRecords`, `PostgresConfig`, `PostgresConnectionConfig`, `PostgresClient`, `PostgresError`, `RedisConfig`, `MemcacheConfig`, `LinkedWithParent`.
- `forRoot/forRootAsync`; inject `DatabaseService`: `getPostgresClient/getRedisClient/getMemcacheClient` (throw if uninitialized), `isPostgresEnabled/isRedisEnabled/isMemcacheEnabled`, **`run(operation)`** — wraps any DB call and rethrows through `translateError`, which also unwraps `error.cause`, mapping `postgres.constraintErrorMap` (constraint name → domain error) so no call site needs try/catch; unknown DB errors become `AppError.internal`. Join helpers `attachParent`/`attachMatchingParent` (`LinkedWithParent<T,U>`, non-enumerable `getParent()`).
- Postgres via `PostgresConfig.factory(drizzleConfig, connection)` (the app owns Drizzle client construction). Config keys: `database.postgres.url` (prod-required), `database.redis.url`, `database.memcache.hosts`, `database.postgres.max-connections`, `database.postgres.lazy-connection`. SQL debug logging auto-wired outside prod at `log.level` debug/silly. Type the client by augmenting `DatabaseRecords`.
- Not every backend uses `run()`/`constraintErrorMap` — `web-novel-server` deliberately follows a direct-client pattern instead (see its CLAUDE.md). Mirror the repo you're in.

### cache
Exports: `CacheModule`, `CacheService`, `RedisCacheService`, `MemcacheService`, and types `CacheModuleOptions`, `CacheModuleAsyncOptions`, `ICacheStore`.
- `CacheModule.forRoot/forRootAsync({imports:[DatabaseModule], useFactory})`; options `lruCacheSize` (default 5000), `lruCacheTTLSeconds`. `CacheService` = L1 LRU over an auto-selected L2 (**Memcached when enabled, else Redis**).
- API: `get/set/del`; **`getOrSet(key, factory, ttlSeconds?)`** — the default read path: cache-aside with single-flight stampede protection (concurrent misses share one factory call; nullish results returned but not cached); `incr/decr(key, amount?)` — atomic in L2, **invalidates** the L1 copy (not write-through). `RedisCacheService` adds `publish(channel, message)`; `ICacheStore` is the backend interface (`get/set/del/incr/decr`).

---

## @shadow-library/ui — React components + tokens (`type: component`)

Subpaths: `.`, `./router`, `./styles.css`, `./styles.layer.css` (`@layer shadow-library`). Peers: `react`/`react-dom` `^18.3 || ^19`; optional `typescript`, `@tanstack/react-router` (only for `./router`). Runtime deps: Radix primitives + `clsx` — **no date library, no cmdk**; dates and CommandPalette are hand-rolled.
Setup: `import '@shadow-library/ui/styles.css'` once (or `styles.layer.css`). Theme via `data-theme`/`data-density` on `<html>` + `--sh-*` token overrides.

### Components (root barrel)
`AccessDenied`, `Accordion`, `ActionSheet`, `Alert`, `Avatar`, `AvatarGroup`, `Badge`, `Banner`, `BannerOutlet`, `BottomNavigation`, `BottomSheet`, `Breadcrumbs`, `Button`, `ButtonGroup`, `Calendar`, `Card`, `Checkbox`, `ColorPicker`, `Combobox`, `CommandPalette`, `ConfirmDialog`, `ContextMenu`, `DataGrid`, `DatePicker`, `DateRangePicker`, `DescriptionList`, `Dialog`, `Drawer`, `DropdownMenu`, `EmptyState`, `Fab`, `FileUpload`, `FormField`, `HoverCard`, `IconButton`, `Input`, `Kbd`, `MultiSelect`, `NotificationCenter`, `NotificationList`, `NumberStepper`, `OtpInput`, `Page`, `Pagination`, `Popover`, `Progress`, `PullToRefresh`, `RadioGroup`, `Rating`, `RTEField`, `SegmentedControl`, `Select`, `Shell`, `Sidebar`, `Skeleton`, `Slider`, `Spinner`, `SplitPane`, `Statistic`, `Stepper`, `SwipeActions`, `Switch`, `Table`, `Tabs`, `Tag`, `Textarea`, `Timeline`, `TimePicker`, `Toaster`, `TokenInput`, `Tooltip`, `TopNavigation`, `TreeView`.
- `AccessDenied` is a new addition (403-style empty-state screen) — pairs with `@shadow-library/web/router`'s new `access-denied` helpers (see that package's section) for a shared "not entitled" pattern.
- There is **no `Toast` component** — the toast surface is `toast` (imperative) + `toastStore` + `Toaster`. `ThemeProvider` is a provider, not a component (below). **`NavProgress` is only on `./router`**, not the root.
- Separately exported parts: `RadioItem`; `SelectItem/SelectGroup/SelectSeparator`; `SplitPanePane/SplitPaneHandle`; `StepperStep`; `TimelineItem`; `TooltipProvider`; `RTEFieldToolbar/RTEFieldToolbarButton/RTEFieldToolbarDivider/RTEFieldContent/RTEFieldAttachments/RTEFieldFooter`; full `DropdownMenu*` and `ContextMenu*` part sets (`Content/Item/CheckboxItem/RadioItem/Label/Separator/SubTrigger/SubContent`).
- Dot-attached compound members (`Object.assign`), spot-checked against source: `Accordion.Item`; `ActionSheet.Item/.Group`; `BottomNavigation.Item`; `Breadcrumbs.Item`; `Card.Header/.Body/.Footer`; `DescriptionList.Item`; `Dialog.Trigger/.Content/.Header/.Body/.Footer/.Close`; `Drawer.Header/.Body/.Footer`; `Popover.Trigger/.Anchor/.Content/.Header/.Close`; `RadioGroup.Item`; `SegmentedControl.Item`; `Select.Item/.Group/.Separator`; `Sidebar.Section/.Item/.Group`; `Skeleton.Table/.Card/.List`; `SplitPane.Pane/.Handle`; `Stepper.Step`; `SwipeActions.Action`; `Tabs.List/.Tab/.Panel`; `Timeline.Item`; `TopNavigation.Item`; `DropdownMenu.*`/`ContextMenu.*` (Trigger/Group/RadioGroup/Sub + the part set); `RTEField.*`.

### Mobile & touch layer
- `data-density="touch"` on `<html>` → finger-first metrics (sm 36 / md 44 / lg 48); a `compact` tier also exists. Tokens: `--sh-tap-target` (44px), `--sh-safe-{top,right,bottom,left}` (wrap `env(safe-area-inset-*)`), breakpoints `--sh-breakpoint-{sm,md,lg,xl,2xl}` (640/768/1024/1280/1536).
- Edge-anchored components (BottomSheet, Drawer, Toast, TopNavigation, BottomNavigation, Fab, ActionSheet, Shell, …) consume the safe-area tokens; sub-44px controls (Checkbox, RadioGroup, IconButton, Slider, Tag, Toast) extend invisible ≥44px hit areas under `@media (pointer: coarse)`. Never hand-roll safe-area/`dvh`/tap-target handling.
- Responsive app shell (automatic): below 768px `Shell` projects its `sidebar` into a modal left nav drawer; `TopNavigation` surfaces the hamburger; the drawer closes on item navigation/Esc/scrim/resize. No props needed — compose `Shell` + `Sidebar` + `TopNavigation` as on desktop.
- Component selection on phones: `BottomNavigation` (3–5 top destinations), `ActionSheet` (replaces anchored menus on touch), `Fab` (single promoted action), `PullToRefresh` (list refresh, promise-aware), `SwipeActions` (row actions with keyboard twin), `BottomSheet` (thumb-reachable overlay where desktop uses Dialog/Popover).

### Providers, stores, hooks, utilities
- Providers: `ThemeProvider`, `useTheme`, `themeInitScript`, `ClientOnly`.
- Imperative stores: `toast`/`toastStore`/`Toaster`; `bannerStore`/`BannerOutlet`/`useBanner`.
- Hooks: `useControllableState`, `useDeferredLoading`, `useHydrated`, `useIsomorphicLayoutEffect`, `useMediaQuery` (SSR-safe); context hooks `useButtonGroupContext`, `useFormField`, `useRadioGroupContext`, `useRTEField`, `useSidebar`.
- Utilities: `cn` (use this — don't add `clsx`/`tailwind-merge` directly), `mergeRefs`, `derivePaginationState`, `calculatePageUpdate`, `toPositiveInt`, `downloadTextFile`, `copyText`, `getInitials`, `formatLongDate`, `DEFAULT_LOCALE`, `matchPath` (+ `MatchPathOptions`), and date helpers `addDays`, `addMonths`, `startOfMonth`, `isSameDay`, `buildMonthMatrix`, `parseISODate`, `toISODate`, `pad2`. Reuse instead of adding a date lib.

### `./router`
`NavProgress` (sole export; needs the optional `@tanstack/react-router` peer).

---

## @shadow-library/web — frontend wiring (per subpath; ESM-only)

Subpaths: `.`, `./router`, `./server`, `./server-entry`, `./pwa`, `./service-worker`, `./offline`. `@shadow-library/common` is an **optional peer** (drives the server-entry logger; no-op without it).

- **`.` (root, isomorphic; needs only `react`):** `ApiError` (fields `status/code/type/fields?/retryAfterSeconds?`; getter `fieldErrors` → `Record<field,string>`), `isApiError` (instanceof + shape fallback — robust across dual SSR/client bundles), `call`, `generateApi`, `APIRequest` (static `get/post/put/patch/delete/setBaseUrl/setPreRequestHook/setPostResponseHook`; chain `.header/.query/.field/.body/.signal(signal)/.timeout(ms)` — composed via `AbortSignal.any`; thenable), `useDeviceId` (localStorage-backed, SSR-safe), and types `ErrorResponse`, `ErrorField`, `ApiResult`, `ApiFailure`, `APIRequestOptions`, `PreRequestHook`, `PreRequestContext`, `PostResponseHook`, `PostResponseContext`, `QueryParams`, `VoidFn`, `JsonValue`, `JsonObject`, `JsonArray`, `JsonPrimitive`. Forward the TanStack Query `signal` — the abort propagates as an abort, not an `ApiError`.
- **`./router`:** `createAppRouter(routeTree, options?)` (per-request QueryClient + SSR-query integration; options: `router?` AND `queryClient?: QueryClientConfig`), `requireAuth(queryClient, query, { loginTo, returnTo })` (generic over `ensureQueryData` options — data type inferred; redirects **only on `ApiError` 401**, other errors rethrow), `useSearchParams` (`{search, appendSearch, setSearch}`); types `CreateAppRouterOptions`, `RequireAuthOptions`, `UseSearchParams`. **New:** an access-denied helper set — `ACCESS_DENIED` (const), `AccessDeniedSearch` (type), `parseAccessDeniedSearch`, `isAccessDeniedSearch`, `isAccessDeniedError` — pairs with `ui`'s `AccessDenied` component to render a consistent "not entitled" (403) page from a route's search params.
- **`./server`:** `createServerFetch({ baseUrl, csrfCookie?, csrfHeader?, csrfTtlSeconds? })` (defaults `'csrf-token'`/`'x-csrf-token'`/3600; cookie forwarding, CSRF double-submit, Set-Cookie relay); types `ServerFetch`, `ServerFetchConfig`, `ServerFetchSpec`. Server-function handlers only.
- **`./server-entry` (Bun):** `serve({ ssrEntry, clientDir, port?, healthPort?, serviceWorkerPaths? })`, `ServeOptions` — static-first + SSR streaming, `/healthz` liveness on a separate port, graceful drain, immutable `/assets/` caching, gzip. Serves `serviceWorkerPaths` (default `['/sw.js']`) with `no-cache` + `Service-Worker-Allowed: /`; `*.webmanifest` as `application/manifest+json`. Logs requests/errors structurally via `common`'s Logger (optional peer; silent without it).
- **`./pwa` (SSR-safe — every export no-ops without browser APIs):** `buildManifest`, `manifestResponse`, `pwaHeadLinks`, `pwaHeadMeta`, `registerServiceWorker`, `messageServiceWorker`, `isServiceWorkerSupported`, `useServiceWorker`, `usePwaInstall`, `useOnlineStatus`, `SW_PROTOCOL` (`'shadow-pwa'`); types `WebAppManifest`, `ManifestIcon`, `ManifestShortcut`, `BuildManifestInput`, `PwaHeadOptions`, `HeadLink`, `HeadMeta`, `SwRequest`, `SwResponse`, `SwEnvelope`, `RegisterServiceWorkerOptions`, `MessageOptions`, `ServiceWorkerController`, `InstallOutcome`, `PwaInstall`, `UseServiceWorker`. Update model is **prompt-then-reload**: a new worker waits, `updateAvailable` fires, `applyUpdate()` activates (one reload; first-visit claim never reloads).
- **`./service-worker` (imported only from `src/sw.ts`; runs in worker scope):** `createServiceWorker(config)`; types `ServiceWorkerConfig`, `RuntimeCachingRule`, `CacheStrategy`. Runtime-configured (no build-time asset manifest): `precache`, `navigationFallback` (+ `navigationFallbackDenylist`), per-pattern `runtimeCaching` with `network-first` (default) / `cache-first` / `stale-while-revalidate` / `network-only` / `cache-only` (each with `networkTimeoutSeconds`/`maxEntries`/`maxAgeSeconds`); `cachePrefix` (default `'shadow'`), `version` (default `'v1'`), `skipWaiting`, `clientsClaim`, `offlineCacheName` (intentionally unversioned — survives deploys). Must be emitted as `/sw.js` by the app's bundler.
- **`./offline` (SSR-safe; IndexedDB opens lazily):** `OfflineStore` (`put/get/has/delete/list/clear/totalSize/estimate`), `OfflineContentManager` (`download/remove/get/list`, exposes `.store`), `useOfflineDownload`, `createIDBPersister` (TanStack Query `Persister` over IndexedDB, no extra peer), `isIndexedDbAvailable`; types `DownloadProgress`, `DownloadOptions`, `RemoveOptions`, `OfflineEntryMeta`, `OfflineStoreOptions`, `PersistedClient`, `Persister`, `IDBPersisterOptions`, `UseOfflineDownload`.

The `ApiError` taxonomy mirrors `common`'s error taxonomy so one error contract flows backend → UI.

---

## @shadow-library/scripts

There is no such package — it was dissolved into root `scripts/` tooling during the monorepo migration
and is never imported. Its commands, `.shadowrc.json` schema, and CI wiring are documented in
`references/repository-setup.md`.
