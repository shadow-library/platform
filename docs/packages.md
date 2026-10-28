# Shared Packages

## Purpose

- `packages/*` are the first-party libraries every app builds on, consumed as `workspace:*`. Their exact API is in the `shadow-library-ecosystem` skill; never deep-import a
  symbol not in a package's `exports`.
- `sdk` is private like the rest, but treat it as a wire contract between Novel Forge and Web Novel. Reach for these packages before hand-rolling DI, config, logging, validation, HTTP, DB,
  caching, UI or transport.

## Layering (dependencies point down only)

- `common` -> `class-schema`, `app` -> `fastify` -> `modules`; `auth` sits beside `modules`. Web side: `ui` and `web`. `sdk` and `ui` depend on no first-party package; `synapse` depends on `common` and `auth`.
- Backends use the backend chain plus `auth` (all but identity), `sdk` (novel-forge, web-novel) and `synapse` (novel-forge, memoir); web apps use `ui` + `web` (+ `common` in identity-web, + `sdk` in novel-forge-web and web-novel-web).
- Put code in the lowest package that can own it. Product logic stays in the app; a package never imports from `apps/*`.

## Roles

- `common` core (`AppError`, `Config`, `Logger`, HTTP client, `svc://` discovery); `class-schema` DTO classes yielding JSON Schema; `app` DI kernel; `fastify` decorator HTTP layer.
- `modules` reusable modules (http-core, database, cache, storage, bootstrap); `auth` Identity consumer SDK, no business logic; `ui` React components and `--sh-*` tokens; `web`
  shared frontend wiring.
- `sdk` novel vocabulary, the Novel Forge to Web Novel content-hash contract, the one prose paragraph count Novel Forge's server and web app share, and the chapter Markdown renderer.
- `synapse` Synapse client: wire types, typed calls, LangChain chat model (subpath `/langchain`); consumed by `novel-forge-server` and `memoir-server`.
- `common`, `modules` and `auth` each also publish a `testing` subpath (`@shadow-library/<pkg>/testing`) of fakes and stand-ins for `apps/*`'s unit tests — e.g. `FakeDatabaseService`,
  `FakeStorageService`, `InMemoryRedis`, `withoutStartupHooks`, `createTestIdP`/`createOfflineAuth`. Apps reach for these instead of hand-rolling a fake or booting real infrastructure.

## Rules for package authors

- Never throw bare `Error` or `new AppError`; declare a `<Domain>ErrorCode` catalog. `AppError.toResponse()` masks internal errors and `from()` fails closed: never loosen either.
- Read config through `Config` inside the app graph; `process.env` is confined to service discovery and standalone entrypoints (migrate, web server entry, SSR transport). `Config`, `Logger` and the reflector live on `global` so duplicate copies share
  one instance.
- `common`'s `./errors`, `./utils`, `./cache`, `./interfaces` subpaths pull in no heavy Node-only dependency (winston, undici, chokidar): keep them that way.
- `common`'s `./crypto` is server-only (`node:crypto`) and outside that browser-safe set: it is never re-exported from the root, and lint bans it in `apps/*-web`, `ui` and `web`.
  A sealed value is bound to its `context`, so the context names an immutable row identity known before insert. A keyring only gains keys; one is removed only when no row uses it.
- `ui`: style only through CSS Modules using `--sh-*` tokens; no Tailwind, no hard-coded hex/px/shadow/duration; add a missing token (light and dark) first.
- `ui`: components never use the global `utilities.css` layer; overlays wrap Radix (never forked); dist stays SSR-import-safe; do not strip the `'use client'` banners.
- `web`: keep server-fetch contract types beside browser code; importing them from the server-only file drags server code into the client bundle.
- `web`: gate a whole app on its auth mode with `requireAccess` in the route's `beforeLoad` (SSR redirects to login); never re-derive the mode in the app. The gate fails closed: anything but an
  exact `public` answer from `GET {basePath}/access` is treated as private. Mount `useSessionGuard({ enabled })` unconditionally and enable it only when private. A tab keeps the mode it
  loaded until reload; the backend always enforces.
- `web`: `precacheUrls` rejects a redirected or non-OK response and is all-or-nothing, so a service worker can never precache a login page as an app shell; a private app's worker therefore installs only after sign-in.
- `web`: `useBuildUpdate` compares the build id stamped into the client against the app's no-store `buildIdResponse` route; it only reports, so reloading stays the user's
  choice. Stamp both from one `resolveBuildId` in the app's Vite config.

## sdk contract (Novel Forge to Web Novel)

- Content ratings are independent ordered dimensions; an absent dimension means unrated and is NEVER equal to `none`. Sources that cannot determine a rating MUST omit the field.
- The chapter content hash is a cross-service contract (Web Novel recomputes and rejects mismatches; Forge uses it for republish vs no-op). No change may move the digest of
  unchanged content; new hashed fields must be additive and absent-by-default, or ship as a versioned hash.
- The wiki-entry hash follows the same rule for Forge's republish vs no-op; the headline gate `imageVisibleFromOrdinal` is omitted unless an entry carries one, and a
  blank image caption is omitted. The wiki headline-gate capability header is part of the same contract.
- The root entrypoint is browser-safe and DOM-free, with `marked` its one dependency; only the `publishing` subpath uses `node:crypto`.
- `renderChapterMarkdown` is the one chapter renderer, and its output is injected without a DOM sanitizer: raw HTML MUST stay escaped, links limited to http, https and mailto,
  images unrendered. Its class names (`chapter-system`, `chapter-system__title`, `chapter-system__body`, `chapter-table`) are what every reader styles.
- `proseParagraphs` is the paragraph count behind every "¶k" Novel Forge shows or stores, on the server and in the browser alike: a change to how it splits
  text renumbers both together, and must keep agreeing with how the Markdown reader sets blocks apart.

## Auth SDK integration contract (`auth`)

- `AuthModule.forRoot()` is the entire integration. NEVER hand-write login/callback/logout routes, verify tokens yourself, or put tokens in cookies. `RelyingParty` is for third
  parties only.
- Identity decides, the SDK enforces; a protocol change on either side changes both in the same change. Configuration is derived from Identity; `audience` and `identityUrl` are the
  only deliberate overrides, so do not add audience/redirect/scope/secret env vars.
- Deny by default: M2M callers need an admin service-access rule; PDP failures fail closed unless a route opts into `failOpen`. Bots need `@BotPermission` and are never `failOpen`.
- On TTL-refreshed data the first load fails the boot; later failures warn and keep the last good value. An Identity outage must never change what a running service accepts.
- The startup role catalog is a destructive full replace: send the complete set. A mint or authorize without `resource` yields an Identity-audience token your API must reject.
- NEVER log tokens, session handles, cookies, PKCE verifiers, `state`, `nonce` or bot keys. Test with `createTestIdP`, never hand-rolled token fixtures.
- `identity-server` does not depend on `auth`; elevation (step-up) never crosses a service boundary.

## Auth access mode (`auth`)

- Two independent layers. Identity decides WHO may hold a session for an app (application visibility: admission, enforced at authorize, app-session mint and refresh). The SDK's access mode decides WHETHER
  a route needs a session at all. Neither substitutes for the other: a `private` app still admits only whom Identity admits, and an app Identity admits to everyone can still run `private`.
- Mode is `public` or `private`. `AUTH_ACCESS_MODE` wins over the code default `AuthModule.forRoot({ defaultAccessMode })`, which wins over `public`; an app opens or closes by configuration alone, so the
  code default states posture and is never the only switch. Read the resolved mode through `AuthAccessPolicy`, never from config, so app code (cache policy, context resolvers) agrees with the guard.
- Route policy: undecorated routes follow the mode (anonymous when public, authenticated when private: deny by default); `@Public()` is anonymous in every mode (health, SDK auth routes);
  `@OptionalAuth()` is the app's anonymous surface in public mode (a bad or absent credential is anonymous, never 401; bot keys are read as anonymous) and is promoted to required in private mode;
  `@Authenticated()` and the other requiring decorators mean the same in both.
- Fail closed: merged metadata that is `public`/`optional` yet carries a requirement (scopes, permission, elevation, bot permissions), or any legacy or unknown access value, throws `CONFIG_INVALID` at route
  registration. Put the requirement on the methods that need it, never on a class that also hosts a public method.
- `private` refuses to boot unless the browser sign-in flow (login and callback routes) is reachable: a bearer-only API cannot be private. `GET {basePath}/access` reports the mode and exists only with the
  browser flow.
- Only controller routes are guarded. Fastify-plugin routes (OpenAPI docs, the separate health server) sit outside the guard; do not put data behind them.
- Pulse keeps its own default-deny sentinel and its own `@Public` marker, distinct from the SDK's.
