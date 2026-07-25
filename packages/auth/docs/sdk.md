# `@shadow-library/auth` — Consumer SDK Specification

|                  |                                                                                                                                                                              |
| :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**       | v1 implemented                                                                                                                                                               |
| **Version**      | 1.1.0 (spec)                                                                                                                                                                 |
| **Last updated** | 2026-07-25                                                                                                                                                                   |
| **Repository**   | this repository — originally developed inside `identity-server` as the workspace package `packages/auth`, since extracted so consumers version the SDK independently (§11.1) |
| **Runtime**      | Bun ≥ 1.3 (WebCrypto Ed25519, native `fetch`); no Node-only APIs                                                                                                             |

## 1. Purpose

Every Shadow Apps service authenticates users and services and enforces permissions. This package is the **only** approved way to do that — no service re-implements token verification, OIDC, PDP calls, or session handling. It is the policy-enforcement-point (PEP) half of the platform; Shadow Identity is the decision half.

Design principles:

1. **Bun-first**: `crypto.subtle` (Ed25519), native `fetch`, `Bun.env`; zero heavy dependencies (no `jsonwebtoken`, no `openid-client`). Target: token verification < 50 µs after JWKS warm-up.
2. **Secure by default**: algorithm allowlist `EdDSA` only, `iss`/`aud`/`exp` always enforced, clock skew ±60 s, deny-by-default guards.
3. **Framework-integrated but not framework-bound**: first-class `@shadow-library/app`/`fastify` module + decorators; a plain functional core (`verify`, `check`, `getServiceToken`) usable from any Bun process.
4. **Fail predictably**: JWKS unreachable → verify uses cached keys until expiry, then fails **closed**; PDP unreachable → guard fails **closed** (configurable per route to fail-open for availability-critical read paths, explicit opt-in).

## 2. Package surface

```ts
// functional core — injectable classes
export { AuthClient, ServiceDiscovery } from '@shadow-library/auth';
// framework integration
export { AuthModule, RelyingPartyModule, Authenticated, RequirePermission, RequireScope, extendContextWithAuth } from '@shadow-library/auth/module';
// OIDC relying-party helper (apps with user login)
export { RelyingParty } from '@shadow-library/auth/rp';
// test utilities
export { createTestIdP } from '@shadow-library/auth/testing';
```

### 2.1 Configuration

`AuthClient` is a plain class; `AuthModule.forRoot()` constructs it and registers it under its own class token, so application services inject it as an ordinary constructor dependency. Everything not passed in code is resolved from the environment:

| Env variable                 | Config                 | Meaning                                                                       |
| :--------------------------- | :--------------------- | :---------------------------------------------------------------------------- |
| `AUTH_ISSUER`                | `issuer`               | Identity base URL; discovery from `{issuer}/.well-known/openid-configuration` |
| `AUTH_AUDIENCE`              | `audience`             | This service's API resource identifier (`aud` it accepts)                     |
| `AUTH_CLIENT_ID`             | `client.id`            | Service-account client id (M2M + PDP calls)                                   |
| `AUTH_CLIENT_SECRET`         | `client.secret`        | Static secret (`client_secret_basic`) — for workloads outside the cluster     |
| `AUTH_CLIENT_ASSERTION_PATH` | `client.assertionPath` | Path to a projected k8s SA token; preferred in-cluster, replaces the secret   |

```ts
// zero-config: issuer, audience, and client all come from AUTH_* env variables
AuthModule.forRoot();

// or explicit (code wins over environment):
AuthModule.forRoot({
  issuer: 'https://identity.shadow-apps.com',
  audience: 'api://pulse',
  client: { id: Bun.env.AUTH_CLIENT_ID!, assertionPath: '/var/run/secrets/shadow/identity-token' },
  cache: { decisionTtlSeconds: 900, jwksTtlSeconds: 43200 }, // defaults: 15 min decisions, 12 h JWKS
  roles: {
    // this application's role catalog, owned in code and pushed on startup (see §4.1)
    permissions: [{ name: 'posts:write', description: 'Create and edit posts' }, { name: 'posts:delete' }],
    roles: [{ name: 'editor', description: 'Content editor', permissions: ['posts:write'] }],
  },
});
```

Config is validated at startup; missing issuer/audience/client in production is a boot failure (fail-closed, mirrors identity's own config policy).

D-21 (architecture §8.6) reduces steady-state configuration to `AUTH_ISSUER` + `AUTH_APP_ID` + a credential — audience, redirect URIs, scopes and the step-up URL are read back from identity and refreshed on a TTL (T-807).

### 2.2 Client authentication: projected SA token or secret

Inside Kubernetes, set `client.assertionPath` (or `AUTH_CLIENT_ASSERTION_PATH`) to a projected service-account token volume whose `audience` is the identity issuer. The SDK then authenticates to `/oauth2/token` with `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` and the file's JWT as `client_assertion` — no static secret anywhere. The file is re-read on every token request because the kubelet rotates it in place. An admin binds the SA subject (`system:serviceaccount:<ns>:<name>`) to the OAuth client via the client's `workloadSubject` field. `client.secret` remains supported for workloads outside the cluster.

## 3. Token verification

```ts
const principal = await auth.verify(bearerToken);
// → { kind: 'user' | 'service', sub, org, sid?, scopes: string[], aal?, claims }
// throws AppError with AuthErrorCode.TOKEN_EXPIRED | TOKEN_INVALID | AUDIENCE_MISMATCH | ISSUER_MISMATCH | ALG_REJECTED | KEY_UNKNOWN
// AuthErrorCode extends common's ErrorCode (same catalog pattern as the servers) and the key itself throws:
// AuthErrorCode.TOKEN_EXPIRED.throw(); narrowing via AppError.is(error, AuthErrorCode.TOKEN_EXPIRED)
```

- JWKS fetched from discovery, cached (L1) for `jwksTtlSeconds` (default **12 h**); an unknown `kid` triggers **one** immediate refetch (singleflight, 10 s negative cache) — this makes key rotation zero-config for consumers. The long TTL only delays propagation of a key _removal_, not the arrival of a new one.
- Ed25519 verification via `crypto.subtle.verify`; keys imported once and cached as `CryptoKey` objects.
- No network call on the hot path after warm-up. `introspect()` exists as an explicit fallback for opaque tokens and MUST NOT be used for routine verification.

## 4. Framework integration (`AuthModule`)

For services built on `@shadow-library/app` + `@shadow-library/fastify`:

```ts
export const HttpModule = FastifyModule.forRoot({ imports: [AuthModule.forRoot(), PostModule] });

@HttpController('/posts')
export class PostController {
  constructor(
    private readonly auth: AuthClient,        // injected by class token
    private readonly context: ContextService, // request-scoped context (import FastifyModule in your module)
  ) {}

  @Get()
  @Authenticated()                       // valid bearer token required
  list() {
    const who = this.context.getAuthPrincipal(); // { kind, sub, org, sid?, scopes, aal?, claims }
  }

  @Post()
  @RequirePermission('posts:write')      // PDP-checked (15 min cached), org from principal
  @RequirePermission('org:delete', { highRisk: true }) // sensitive → 60 s cache for fast revocation
  create() { … }

  @Post('/internal/reindex')
  @RequireScope('posts:admin')           // M2M callers additionally need an admin-configured access rule (§4.2)
  reindex() { … }
}
```

Implementation notes: guards are `@Middleware`-based (see `fastify/src/decorators/middleware.decorator.ts`) and store the resolved principal in the request-scoped `ContextService`. `AuthModule` extends the context with `getAuthPrincipal()` (throws 401 when the route ran unauthenticated) and `getAuthPrincipalOrNull()`. Decorator metadata degrades gracefully: `@RequirePermission` implies `@Authenticated`.

### 4.1 Role catalog sync

When `roles` is set (and `client` credentials are present), `AuthModule.forRoot` pushes the application's catalog to identity on startup via `auth.syncRoles(manifest)` → `PUT /api/v1/authz/catalog` (scope `authz:roles:sync`). You can also call `auth.syncRoles(...)` directly (e.g. from a migration or CI step).

- **Ownership**: the catalog for an application lives in that application's code, not in hand-run admin calls. The target application is derived from the service-account token, never from the request body — a service can only touch **its own** application's catalog.
- **Declarative full-sync**: the manifest is the complete truth. Permissions/roles absent from it are **deleted** in identity, cascading into `role_permissions` and `role_assignments`; affected principals are cache-invalidated. A role may only reference permission names it also declares (else an `AppError` with `AuthErrorCode.ROLE_SYNC_FAILED` / HTTP 400).
- **Guardrail**: because it deletes, identity refuses a manifest that would remove too much of the application's catalog — the signature of a truncated or half-generated one — and the SDK surfaces that as `AuthErrorCode.ROLE_SYNC_REFUSED` (409), deliberately distinct from the retryable `ROLE_SYNC_FAILED`. Override it with `auth.syncRoles(manifest, { force: true })` at a call site that means it; `AuthModule`'s startup sync never passes `force`.
- **Footgun**: the manifest is production config. It is bounded to the pushing application and every sync is audited (`authz.catalog.synced`), but a deliberate forced sync still revokes grants. Assignments (which user has which role) are **not** managed here — they stay an admin operation.

### 4.1.1 Scope narrowing on app-session mints

`POST /api/v1/app-sessions/token` answers **200 with whatever scope survived** filtering rather than refusing an over-broad request. The SDK therefore compares requested against returned on every mint, logs the delta at warn, and exposes the survivors as `AppSessionToken.grantedScopes` — a caller that reads its own request back instead hands its API a token missing the capability it is about to check for. `strictScopes: true` / `AUTH_STRICT_SCOPES=true` turns a narrowing into a thrown `AuthErrorCode.SCOPE_NOT_GRANTED`. Cached tokens are keyed by the **granted** scope, so the cache can never claim to hold a capability it does not.

### 4.2 Admin-managed service access (M2M route allowlist)

There is no per-route caller-allowlist decorator. Which M2M caller may invoke which routes is configured in the identity **admin panel** (`/api/v1/admin/service-access`: target application, caller client, method, path pattern — trailing `*` wildcard). On startup `AuthModule` loads the rules for its own application via `GET /api/v1/authz/service-access` (service token, scope `authz:check`), and the guard enforces them locally: a `kind=service` principal is **denied on every authenticated route** unless a rule covers that caller + method + path. Rules are re-fetched on a TTL (default 300 s, `serviceAccess.refreshSeconds` / `AUTH_SERVICE_ACCESS_REFRESH_SECONDS`), so granting **or revoking** a caller takes effect within one interval; refreshes are singleflighted, a failed refresh logs at warn and keeps the last good rules, and a failed load at startup aborts the boot rather than silently denying everything forever. `auth.refreshServiceAccess()` forces one out of band and never throws.

## 5. PDP client

```ts
await auth.check({ action: 'posts:write', organisation: who.org, principal: who }); // → boolean
await auth.checkAll([{ action: 'posts:write' }, { action: 'posts:publish' }], who); // batch
```

- Calls `POST {issuer}/api/v1/authz/check` authenticated with the service's own M2M token. The endpoint requires the token to carry the `authz:check` scope (seeded at server bootstrap); the SDK requests that scope automatically, so the service's OAuth client **must be granted it at provisioning time** or every check denies.
- L1 LRU cache keyed `(principal, org, action, resource, authz_version)`, TTL **15 min** by default and **60 s** for `highRisk` decisions. The response's `authz_version` is compared on each hit; a bump (delivered piggybacked on responses) discards stale entries.
- Deny-by-default: network failure, non-200, or malformed response ⇒ `false` (unless the route opted into fail-open).

## 6. Service-to-service tokens (M2M)

```ts
const token = await auth.getServiceToken({ resource: 'api://novel-forge', scopes: ['books:read'] });
fetch(url, { headers: { authorization: `Bearer ${token}` } });
```

- Client-credentials call to `/oauth2/token`; token cached until `exp − 60 s`; concurrent callers share one in-flight refresh (singleflight); 401/`invalid_client` responses surface immediately (no retry storm).
- Convenience: `auth.fetch(url, init, { resource })` — a `fetch` wrapper that injects and refreshes the token, with single automatic retry on a 401 caused by a just-expired token.

### 6.1 Acting as the user (token exchange, D-22)

```ts
const { accessToken, scope } = await auth.exchangeUserToken({ subjectToken, resource: 'api://novel-forge', scopes: ['books:read'] });
```

- RFC 8693 `urn:ietf:params:oauth:grant-type:token-exchange` against `/oauth2/token`, authenticated with the application's own credential (secret or projected SA assertion).
- The server **narrows silently** — it intersects the request with what the subject and the calling application both hold — so the granted `scope` is returned and callers must read it rather than assume.
- **Single hop**: a subject token already carrying `act` is refused client-side with `AuthErrorCode.TOKEN_EXCHANGE_REFUSED` before any network call, so a service being called through an exchange learns it from the token it holds.
- **Never cached**: the result is per-user, short-lived, and `exp`-capped by its subject.

### 6.2 Service discovery

Inside the cluster a Service is reachable by its own name, so the service name **is** the domain by default:

```ts
await auth.fetchService('pulse', '/api/v1/send', { method: 'POST', body }); // → http://pulse/api/v1/send + Bearer token (resource defaults to the service name)
auth.resolveService('pulse'); // → 'http://pulse'
```

Resolution order: `SERVICE_URL_<NAME>` env override (dashes become underscores — e.g. `SERVICE_URL_PULSE=https://pulse.shadow-apps.com` for services outside the cluster or on custom domains) → default `{SERVICE_DISCOVERY_SCHEME:-http}://<name>{SERVICE_DISCOVERY_SUFFIX:-}`. Set `SERVICE_DISCOVERY_SUFFIX=.prod.svc.cluster.local` for cross-namespace DNS. The standalone `ServiceDiscovery` class is exported for non-auth uses.

## 7. Relying-party helper (third-party / external clients)

**A first-party Shadow app never uses `RelyingParty`**: it logs users in through `AuthModule`'s browser routes, exchanging the authorization code for an app-session handle and holding no tokens at rest (D-18). The RP helper implements the standard OIDC token-pair flow for everything else — third-party clients and non-Shadow consumers:

```ts
// injectable: RelyingPartyModule.forRoot() provides it under its class token (issuer falls back to AUTH_ISSUER)
const rp = new RelyingParty({
  issuer: 'https://identity.shadow-apps.com',
  client: { id: Bun.env.WEB_CLIENT_ID!, secret: Bun.env.WEB_CLIENT_SECRET },
  redirectUri: 'https://pulse.shadow-apps.com/auth/callback',
});

app.get('/auth/login', rp.beginLogin()); // → 302 /oauth2/authorize (PKCE S256 + state + nonce, Redis/memory state store)
app.get('/auth/callback', rp.handleCallback()); // code→token exchange, nonce check, establish app session
app.post('/auth/backchannel-logout', rp.handleBackChannelLogout()); // verifies logout token, destroys sessions by sid
app.post('/auth/logout', rp.logout()); // local + optional RP-initiated logout redirect
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

## 11. Implementation notes (v1)

Deliberate deviations from this spec in the shipped v1, each to be revisited with T-303:

1. **Monorepo placement — superseded.** v1 was developed at `packages/auth` in the identity repo so its integration suite could run against the real server; the package has since been **extracted into its own repository** and versions independently (D-5 updated 2026-07-25).
2. **JSON token-endpoint bodies — resolved.** The server now accepts RFC 6749 form encoding (JSON remains accepted for one release, logged under `deprecation: oauth.json_body`) and the SDK sends form-encoded requests.
3. **RP scope.** `RelyingParty` ships the protocol core — authorization URL with PKCE S256 + `state`/`nonce`, code exchange, ID-token validation (including `nonce`), refresh. App-session cookie management and back-channel logout are the consuming app's responsibility until the session adapters land with T-303.
4. **`@Principal()`.** The framework's parameter decorators are a fixed set, so the principal is read from the request context: `context.getAuthPrincipal()` on the injected `ContextService` replaces the spec'd param decorator.
5. **PDP transport.** `checkAll` fans out to parallel single checks; the batch HTTP endpoint arrives with the PDP batch API.
6. **Logging.** Every outbound call and guard decision logs under the `@shadow-library/auth` namespace via common's `Logger` — lifecycle milestones at info (discovery loaded, jwks refreshed, token minted, roles synced, rules loaded), degraded paths at warn (jwks served stale, PDP fallback, 401 retry, guard denials), failures at error. Only debug entries may carry sensitive material (token bodies, state/nonce); info and above never do.
