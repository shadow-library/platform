# Shared Packages

## Purpose

- `packages/*` are the first-party libraries every app builds on, consumed as `workspace:*`. Their exact API is in the `shadow-library-ecosystem` skill; never deep-import a
  symbol not in a package's `exports`.
- `sdk` is private like the rest, but treat it as a wire contract between Novel Forge and Web Novel. Reach for these packages before hand-rolling DI, config, logging, validation, HTTP, DB,
  caching, UI or transport.

## Layering (dependencies point down only)

- `common` -> `class-schema`, `app` -> `fastify` -> `modules`; `auth` sits beside `modules`. Web side: `ui` and `web`. `sdk` and `ui` depend on no first-party package.
- Backends use the backend chain plus `auth` (all but identity) and `sdk` (novel-forge, web-novel); web apps use `ui` + `web` (+ `common` in identity-web, + `sdk` in novel-forge-web and web-novel-web).
- Put code in the lowest package that can own it. Product logic stays in the app; a package never imports from `apps/*`.

## Roles

- `common` core (`AppError`, `Config`, `Logger`, HTTP client, `svc://` discovery); `class-schema` DTO classes yielding JSON Schema; `app` DI kernel; `fastify` decorator HTTP layer.
- `modules` reusable modules (http-core, database, cache, storage, bootstrap); `auth` Identity consumer SDK, no business logic; `ui` React components and `--sh-*` tokens; `web`
  shared frontend wiring.
- `sdk` novel vocabulary and the Novel Forge to Web Novel content-hash contract.

## Rules for package authors

- Never throw bare `Error` or `new AppError`; declare a `<Domain>ErrorCode` catalog. `AppError.toResponse()` masks internal errors and `from()` fails closed: never loosen either.
- Read config through `Config` inside the app graph; `process.env` is confined to service discovery and standalone entrypoints (migrate, web server entry, SSR transport). `Config`, `Logger` and the reflector live on `global` so duplicate copies share
  one instance.
- `common`'s `./errors`, `./utils`, `./cache`, `./interfaces` subpaths pull in no heavy Node-only dependency (winston, undici, chokidar): keep them that way.
- `ui`: style only through CSS Modules using `--sh-*` tokens; no Tailwind, no hard-coded hex/px/shadow/duration; add a missing token (light and dark) first.
- `ui`: components never use the global `utilities.css` layer; overlays wrap Radix (never forked); dist stays SSR-import-safe; do not strip the `'use client'` banners.
- `web`: keep server-fetch contract types beside browser code; importing them from the server-only file drags server code into the client bundle.

## sdk contract (Novel Forge to Web Novel)

- Content ratings are independent ordered dimensions; an absent dimension means unrated and is NEVER equal to `none`. Sources that cannot determine a rating MUST omit the field.
- The chapter content hash is a cross-service contract (Web Novel recomputes and rejects mismatches; Forge uses it for republish vs no-op). No change may move the digest of
  unchanged content; new hashed fields must be additive and absent-by-default, or ship as a versioned hash.
- The root entrypoint is browser-safe and dependency-free; only the `publishing` subpath uses `node:crypto`.

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
