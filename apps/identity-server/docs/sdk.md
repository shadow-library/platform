# `@shadow-library/auth` — Consumer SDK Specification

| | |
| :--- | :--- |
| **Status** | v1 implemented (`packages/auth`) |
| **Version** | 1.0.0 (spec) |
| **Last updated** | 2026-07-11 |
| **Repository** | workspace package `packages/auth` in this repo — the server and SDK share protocol logic, and keeping them together lets the SDK be integration-tested against the real server on every commit |
| **Runtime** | Bun ≥ 1.3 (WebCrypto Ed25519, native `fetch`); no Node-only APIs |

## 1. Purpose

Every Shadow Apps service authenticates users and services and enforces permissions. This package is the **only** approved way to do that — no service re-implements token verification, OIDC, PDP calls, or session handling. It is the policy-enforcement-point (PEP) half of the platform; Shadow Identity is the decision half.

Design principles:

1. **Bun-first**: `crypto.subtle` (Ed25519), native `fetch`, `Bun.env`; zero heavy dependencies (no `jsonwebtoken`, no `openid-client`). Target: token verification < 50 µs after JWKS warm-up.
2. **Secure by default**: algorithm allowlist `EdDSA` only, `iss`/`aud`/`exp` always enforced, clock skew ±60 s, deny-by-default guards.
3. **Framework-integrated but not framework-bound**: first-class `@shadow-library/app`/`fastify` module + decorators; a plain functional core (`verify`, `check`, `getServiceToken`) usable from any Bun process.
4. **Fail predictably**: JWKS unreachable → verify uses cached keys until expiry, then fails **closed**; PDP unreachable → guard fails **closed** (configurable per route to fail-open for availability-critical read paths, explicit opt-in).

## 2. Package surface

```ts
// functional core
export { createAuthClient } from '@shadow-library/auth';
// framework integration
export { AuthModule, Authenticated, RequirePermission, RequireScope, AllowService } from '@shadow-library/auth/module';
// OIDC relying-party helper (apps with user login)
export { createRelyingParty } from '@shadow-library/auth/rp';
// test utilities
export { createTestIdP } from '@shadow-library/auth/testing';
```

### 2.1 Configuration

```ts
const auth = createAuthClient({
  issuer: 'https://identity.shadow-apps.com',          // discovery: {issuer}/.well-known/openid-configuration
  audience: 'api://pulse',                             // this service's API resource identifier
  client: {                                            // service-account credentials (M2M + PDP calls)
    id: Bun.env.IDENTITY_CLIENT_ID!,
    secret: Bun.env.IDENTITY_CLIENT_SECRET,            // or privateKeyJwt: { kid, key } for private_key_jwt
  },
  cache: { decisionTtlSeconds: 60, jwksTtlSeconds: 300 },
});
```

Config is validated at startup; missing issuer/audience/client in production is a boot failure (fail-closed, mirrors identity's own config policy).

## 3. Token verification

```ts
const principal = await auth.verify(bearerToken);
// → { kind: 'user' | 'service', sub, org, sid?, scopes: string[], aal?, claims }
// throws AuthError('TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'AUDIENCE_MISMATCH' | 'ISSUER_MISMATCH' | 'ALG_REJECTED' | 'KEY_UNKNOWN')
```

- JWKS fetched from discovery, cached (L1) for `jwksTtlSeconds`; an unknown `kid` triggers **one** immediate refetch (singleflight, 10 s negative cache) — this makes key rotation zero-config for consumers.
- Ed25519 verification via `crypto.subtle.verify`; keys imported once and cached as `CryptoKey` objects.
- No network call on the hot path after warm-up. `introspect()` exists as an explicit fallback for opaque tokens and MUST NOT be used for routine verification.

## 4. Framework integration (`AuthModule`)

For services built on `@shadow-library/app` + `@shadow-library/fastify`:

```ts
@Module({ imports: [AuthModule.forRoot({ /* createAuthClient config */ })] })
export class AppModule {}

@HttpController('/posts')
export class PostController {
  @Get()
  @Authenticated()                       // valid bearer token or app session required
  list(@Principal() who: AuthPrincipal) { … }

  @Post()
  @RequirePermission('posts:write')      // PDP-checked (60 s cached), org from principal
  create() { … }

  @Post('/internal/reindex')
  @AllowService('svc-indexer')           // M2M-only route: kind=service + allowed client + scope
  @RequireScope('posts:admin')
  reindex() { … }
}
```

Implementation notes: guards are `@Middleware`-based (see `fastify/src/decorators/middleware.decorator.ts`), attach the resolved principal to the request context, and integrate with the framework `Logger` context so every log line carries `principal.sub` and `org`. Decorator metadata degrades gracefully: `@RequirePermission` implies `@Authenticated`.

## 5. PDP client

```ts
await auth.check({ action: 'posts:write', organisation: who.org, principal: who });        // → boolean
await auth.checkAll([{ action: 'posts:write' }, { action: 'posts:publish' }], who);        // batch
```

- Calls `POST {issuer}/api/v1/authz/check` authenticated with the service's own M2M token.
- L1 LRU cache keyed `(principal, org, action, resource, authz_version)`, TTL 60 s. The response's `authz_version` is compared on each hit; a bump (delivered piggybacked on responses) discards stale entries.
- Deny-by-default: network failure, non-200, or malformed response ⇒ `false` (unless the route opted into fail-open).

## 6. Service-to-service tokens (M2M)

```ts
const token = await auth.getServiceToken({ resource: 'api://novel-forge', scopes: ['books:read'] });
fetch(url, { headers: { authorization: `Bearer ${token}` } });
```

- Client-credentials call to `/oauth2/token`; token cached until `exp − 60 s`; concurrent callers share one in-flight refresh (singleflight); 401/`invalid_client` responses surface immediately (no retry storm).
- Convenience: `auth.fetch(url, init, { resource })` — a `fetch` wrapper that injects and refreshes the token, with single automatic retry on a 401 caused by a just-expired token.

## 7. Relying-party helper (user login for apps)

For first-party apps with server backends:

```ts
const rp = createRelyingParty({
  ...clientConfig,
  redirectUri: 'https://pulse.shadow-apps.com/auth/callback',
  session: { cookieName: '__Host-app_sid', secret: Bun.env.SESSION_SECRET!, idleDays: 30 },
});

app.get('/auth/login',    rp.beginLogin());     // → 302 /oauth2/authorize (PKCE S256 + state + nonce, Redis/memory state store)
app.get('/auth/callback', rp.handleCallback()); // code→token exchange, nonce check, establish app session
app.post('/auth/backchannel-logout', rp.handleBackChannelLogout()); // verifies logout token, destroys sessions by sid
app.post('/auth/logout',  rp.logout());         // local + optional RP-initiated logout redirect
```

The RP helper owns: PKCE generation/verification, `state`/`nonce` handling, ID-token validation (including `nonce` and `acr`), app-session cookie management (opaque, HttpOnly, SameSite=Lax), and back-channel-logout `sid` mapping. Apps never parse tokens themselves.

## 8. Test utilities

`createTestIdP()` spins an in-process mock: generates an ephemeral Ed25519 key, serves discovery + JWKS on a random port, and mints arbitrary user/service tokens — so consuming services can integration-test guards without a running identity service. Also exported: `signTestToken(claims)` for unit tests.

## 9. Compatibility contract

- The SDK version tracks the identity API contract (semver; breaking protocol changes = major).
- The SDK MUST tolerate: new JWT claims (ignore), new JWKS keys (auto-refresh), new PDP response fields (ignore).
- Identity MUST keep: `EdDSA` signatures, claim names, discovery shape, and the `/authz/check` request/response contract stable within a major version.

## 10. Explicit non-goals

No token issuance, no credential storage, no login UI, no session storage backends beyond cookie+memory/Redis adapters, no support for non-Shadow identity providers. Anything issuing or persisting credentials belongs to Shadow Identity itself.

## 11. Implementation notes (v1, `packages/auth`)

Deliberate deviations from this spec in the shipped v1, each to be revisited with T-303:

1. **Monorepo placement.** The package lives at `packages/auth` in the identity repo (Bun workspace), not a sibling repo: server and SDK share protocol logic, and the SDK's integration suite (`tests/sdk/`) runs against the real server on every commit via an injectable `fetch` transport bridged onto the test router.
2. **JSON token-endpoint bodies.** The identity server parses JSON only, so the SDK sends `application/json` to `/oauth2/token` instead of RFC 6749 form encoding. Internal-ecosystem consistency wins until form parsing lands server-side.
3. **RP scope.** `createRelyingParty` ships the protocol core — authorization URL with PKCE S256 + `state`/`nonce`, code exchange, ID-token validation (including `nonce`), refresh. App-session cookie management and back-channel logout are the consuming app's responsibility until the session adapters land with T-303.
4. **`@Principal()`.** The framework's parameter decorators are a fixed set, so the principal is read with `getPrincipal(request)` (the guard attaches it to the request); `@Req()` + `getPrincipal` replaces the spec'd param decorator.
5. **PDP transport.** `checkAll` fans out to parallel single checks; the batch HTTP endpoint arrives with the PDP batch API.
