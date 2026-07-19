# Shadow Identity — Service Integration Guide

|                  |                                                    |
| :--------------- | :------------------------------------------------- |
| **Audience**     | Teams building a first-party service on the platform |
| **SDK**          | `@shadow-library/auth`                             |
| **Status**       | Living document                                    |
| **See also**     | `docs/architecture.md` (design), `docs/sdk.md` (SDK reference), `docs/auth/api-contract.md` (HTTP contract) |

This is the practical, task-oriented guide for wiring your service into Shadow Identity: how authentication and authorization actually work, how services talk to each other, and how to use the `@shadow-library/auth` package to protect your routes. If you just want the checklist, jump to [§10](#10-integration-checklist).

---

## 1. The mental model (read this first)

Shadow Identity separates two credentials that people often conflate. **Your service only ever deals with the second one.**

| | Browser session | Access token (what your service sees) |
| :-- | :-- | :-- |
| Format | Opaque cookie (`__Host-sid`) | **JWT, EdDSA-signed** |
| Who holds it | The identity domain only | Passed to your service as `Authorization: Bearer …` |
| How it's checked | DB + cache lookup inside identity | **Verified offline in your process** against identity's JWKS |
| Your involvement | None | You verify it locally; no call back to identity |

Three consequences that shape everything below:

1. **Token verification is offline and stateless.** After the SDK fetches identity's public keys once (cached ~12 h), verifying a request is a local signature + claims check — **zero network calls, zero DB hits, identity is not in your hot path.**
2. **Access tokens carry identity, not permissions.** A token says *who* you are (`sub`, `org`, `aud`, `scope`, `sid`, `aal`) but not *what you may do* on a fine-grained resource. Permission decisions go to the **PDP** (`/api/v1/authz/check`), which the SDK calls and caches.
3. **Revocation is eventually-consistent, by design.** Because verification is offline, a revoked session keeps working until its token expires (≤ 60 min), and a revoked grant until the PDP cache entry expires (≤ 15 min, or 60 s for high-risk actions). This is an accepted tradeoff — see `architecture.md` §9.1. If you need an instant kill-switch on a specific route, mark it `highRisk` (§4.4).

---

## 2. Onboarding: register your service

Before writing code, ask the **identity platform admin** to register your service. You are an OAuth client. Decide which shape you are:

| You are… | Client type | Auth method | Needs |
| :-- | :-- | :-- | :-- |
| A backend/API service **in the cluster** | **`SERVICE`** (service account) | **k8s workload identity** (projected SA token as client assertion) | client id + `workloadSubject` binding, granted scopes — **no secret** |
| A backend/API service outside the cluster | **`SERVICE`** (service account) | `client_secret_basic` | client id + secret, granted scopes |
| A server-rendered app that logs users in | **`WEB_CONFIDENTIAL`** | `client_secret_basic` + PKCE | client id + secret, redirect URIs |
| A browser SPA with no backend | **`SPA_PUBLIC`** | PKCE only (`none`) | client id, redirect URIs |

What to request from the admin:

- **API resource identifier** (your `audience`, e.g. `api://pulse`) — tokens minted for your API carry this in `aud`; you reject anything else.
- **Scopes** your API exposes (e.g. `posts:read`, `posts:write`) and, if you'll use the SDK's authorization/role features, the identity-side scopes:
  - `authz:check` — required for your service to call the PDP (i.e. to use `@RequirePermission`).
  - `authz:roles:sync` — required to push your role catalog (§5.2).
- **Redirect URIs** (exact-match, no wildcards) if you log users in.
- **Workload subject binding** (in-cluster services): give the admin your service account's subject, `system:serviceaccount:<namespace>:<name>`. The admin sets it as the client's `workloadSubject`, and your pod then authenticates with its projected SA token — no secret to provision or rotate.
- **Service-access rules** if other services will call you (or you call others): the admin configures which caller client may hit which of your routes (§6.1).

You'll receive a **client id** and, for secret-based confidential clients, a **secret** (shown once — store it in your secret manager, injected as an env var).

### 2.1 First-party ecosystem apps are pre-seeded

The identity server's boot seed (`EcosystemSeedService`) idempotently provisions the first-party ecosystem on every boot — no admin request needed for these apps:

| Application | RP client (`WEB_CONFIDENTIAL`, code + PKCE) | Service client (`SERVICE`, `client_credentials`) | API resource / audience |
| :-- | :-- | :-- | :-- |
| `pulse` | `pulse` | `pulse-server` | `pulse-server` |
| `novel-forge` | `novel-forge` | `novel-forge-server` | `novel-forge-server` |
| `webnovel` | `webnovel` | `webnovel-server` | `webnovel-server` |
| `shadow-identity` (platform) | — | `identity-server` (identity's own outbound calls) | `shadow-identity` |

Also seeded:

- Every `*-server` client is granted `authz:check` and `authz:roles:sync` (so the SDK can load service-access rules, call the PDP, and push a role catalog).
- `novel-forge-server` is granted the `webnovel:publish` scope (on the `webnovel-server` resource).
- Service-access rules: `identity-server` → pulse `POST /api/v1/notifications`; `novel-forge-server` → webnovel `* /internal/*`.
- RP redirect URIs: `{origin}/api/auth/callback` for every public origin on the application. Origins are stored on the application (`applications.public_urls`) — seeded with defaults (`http://<app>.shadow-apps.test` plus a localhost dev variant) the first time the app is created, then managed through the admin console's application page. Editing an app's public URLs regenerates its relying-party clients' redirect URIs; the seed no longer overwrites them on boot.

**Client ids and secrets.** By default client ids are database-generated UUIDs, so they differ per environment. On the boot that first creates a client, its id and secret are logged once (`Registered service client '<name>' …` — same convention as the bootstrap-admin password); afterwards look ids up via `GET /api/v1/admin/clients` and mint a fresh secret with `POST /api/v1/admin/clients/:clientId/rotate-secret` (dual-secret overlap, so running consumers keep working while you re-configure). Secrets are stored hashed; they cannot be read back.

**Fixed credentials (optional).** Instead of capturing random credentials from the first-boot log, a cluster can pre-declare them through the identity server's environment — one id/secret pair per seeded client:

| Seeded client | Client id env (must be a UUID) | Secret env |
| :-- | :-- | :-- |
| `pulse` (RP) | `ECOSYSTEM_PULSE_RP_CLIENT_ID` | `ECOSYSTEM_PULSE_RP_CLIENT_SECRET` |
| `pulse-server` | `ECOSYSTEM_PULSE_SERVER_CLIENT_ID` | `ECOSYSTEM_PULSE_SERVER_CLIENT_SECRET` |
| `novel-forge` (RP) | `ECOSYSTEM_NOVEL_FORGE_RP_CLIENT_ID` | `ECOSYSTEM_NOVEL_FORGE_RP_CLIENT_SECRET` |
| `novel-forge-server` | `ECOSYSTEM_NOVEL_FORGE_SERVER_CLIENT_ID` | `ECOSYSTEM_NOVEL_FORGE_SERVER_CLIENT_SECRET` |
| `webnovel` (RP) | `ECOSYSTEM_WEBNOVEL_RP_CLIENT_ID` | `ECOSYSTEM_WEBNOVEL_RP_CLIENT_SECRET` |
| `webnovel-server` | `ECOSYSTEM_WEBNOVEL_SERVER_CLIENT_ID` | `ECOSYSTEM_WEBNOVEL_SERVER_CLIENT_SECRET` |
| `identity-server` | `ECOSYSTEM_IDENTITY_SERVER_CLIENT_ID` | `ECOSYSTEM_IDENTITY_SERVER_CLIENT_SECRET` |

Every variable is optional and each pair's halves are independent; whatever is unset keeps the random behaviour above. Semantics:

- **Ids bind only at creation.** A configured id must be a UUID (boot fails otherwise) and is assigned when the seed first creates the client. If the client already exists under a different id, the seed keeps the existing id and logs a warning — it never re-keys a live client, since consents, grants and tokens reference the id. Use distinct UUIDs per client; a collision with an existing id fails the boot.
- **Secrets converge on every boot.** When the env secret no longer verifies against the stored hash, the seed revokes the client's active secrets and installs the env value — so rotating the env var rotates the client (no dual-secret overlap: update the consumer and identity together). Env-provided secrets are never written to the logs.
- **Local clusters:** committing deterministic UUIDs/secrets in dev compose files is fine — every fresh `docker compose up` then yields the credentials your downstream `.env` files already reference.
- **Production:** leave these unset (capture credentials at first boot, rotate via the admin API) or inject both halves from your secret manager and rotate by changing the env secret.

**What each downstream service sets in its environment:**

```sh
# SDK (AuthModule) — token verification, rules loading, PDP, M2M
AUTH_ISSUER=<identity base URL>            # e.g. http://localhost:8080 in dev
AUTH_AUDIENCE=<your API resource>          # e.g. pulse-server
AUTH_CLIENT_ID=<uuid of your *-server client>
AUTH_CLIENT_SECRET=<secret>                # or AUTH_CLIENT_ASSERTION_PATH in-cluster

# RP login flow (RelyingPartyModule) — app-defined keys, guide convention:
APP_PUBLIC_URL=<your public origin>        # callback = {APP_PUBLIC_URL}/api/auth/callback
APP_CLIENT_ID=<uuid of your RP client>
APP_CLIENT_SECRET=<secret>
```

The identity server itself sets `AUTH_CLIENT_ID`/`AUTH_CLIENT_SECRET` to its `identity-server` client when calling pulse's notification API.

---

## 3. Install the SDK

```sh
bun add @shadow-library/auth
```

Import subpaths (accurate as of SDK 0.1):

| Path | Gives you |
| :-- | :-- |
| `@shadow-library/auth` | `AuthClient` (injectable class), `ServiceDiscovery`, `AuthErrorCode`, all interfaces, low-level `verifyJwt` |
| `@shadow-library/auth/module` | `AuthModule`, `RelyingPartyModule`, guard decorators (`@Authenticated`, `@RequirePermission`, …), the `ContextService` auth extension |
| `@shadow-library/auth/rp` | `RelyingParty` (OIDC login for apps) |
| `@shadow-library/auth/testing` | `createTestIdP` (in-process mock identity for your tests) |

The SDK is Bun-first (WebCrypto Ed25519, native `fetch`), zero heavy deps.

---

## 4. Protect your service (authentication + authorization)

For services built on `@shadow-library/app` + `@shadow-library/fastify`, wire the module once and annotate routes with decorators. The guard only attaches to routes that carry auth metadata, so unguarded routes pay nothing.

### 4.1 Register the module

The module reads its configuration from the environment, so registration is usually a one-liner:

```ts
// app.module.ts
import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { AuthModule } from '@shadow-library/auth/module';

@Module({
  imports: [
    FastifyModule.forRoot({
      imports: [AuthModule.forRoot()],   // issuer, audience, client all come from AUTH_* env vars
    }),
  ],
})
export class AppModule {}
```

`AuthModule.forRoot` must live inside `FastifyModule.forRoot({ imports })` so the guard middleware registers against the HTTP routes. Anything you pass in code overrides the environment (e.g. `AuthModule.forRoot({ roles })` to add the role catalog, §5.2).

On startup the module also: extends the request context with `getAuthPrincipal()` (§4.3), pushes the role catalog when one is declared, and loads your service-access rules (§6.1). A failure of those startup calls aborts the boot — fail-closed beats silently denying every M2M caller.

### 4.2 Configuration reference

| Env variable | Config field | Required | Default | Purpose |
| :-- | :-- | :-- | :-- | :-- |
| `AUTH_ISSUER` | `issuer` | ✅ | — | Identity base URL; discovery + JWKS are fetched from it |
| `AUTH_AUDIENCE` | `audience` | ✅ | — | Your API resource id; tokens whose `aud` doesn't include it are rejected |
| `AUTH_CLIENT_ID` | `client.id` | for PDP/M2M | — | Service-account client id |
| `AUTH_CLIENT_ASSERTION_PATH` | `client.assertionPath` | in-cluster | — | Path to the projected k8s SA token (preferred; replaces the secret) |
| `AUTH_CLIENT_SECRET` | `client.secret` | out-of-cluster | — | Static client secret (`client_secret_basic`) |
| — | `identityResource` | — | `shadow-identity` | Audience of the SDK's own token toward identity (PDP calls) |
| — | `clockSkewSeconds` | — | `60` | Tolerated `exp`/`nbf` drift |
| — | `cache.jwksTtlSeconds` | — | `43200` (12 h) | In-process JWKS cache |
| — | `cache.decisionTtlSeconds` | — | `900` (15 min) | PDP decision cache |
| — | `roles` | — | — | Your role catalog, pushed on startup (§5.2) |
| — | `fetch` | — | global `fetch` | Transport override (tests) |

Config is validated at startup; a missing `issuer`/`audience` in production is a boot failure (fail-closed).

**In-cluster (recommended):** mount a projected service-account token volume with `audience: <identity issuer>` and point `AUTH_CLIENT_ASSERTION_PATH` at it:

```yaml
volumes:
  - name: identity-token
    projected:
      sources:
        - serviceAccountToken: { path: token, audience: 'https://identity.shadow-apps.com', expirationSeconds: 3600 }
# container:
volumeMounts: [{ name: identity-token, mountPath: /var/run/secrets/shadow, readOnly: true }]
env:
  - { name: AUTH_CLIENT_ASSERTION_PATH, value: /var/run/secrets/shadow/token }
```

The SDK re-reads the file on every token request (the kubelet rotates it in place) and authenticates with it as an RFC 7523 client assertion — there is no client secret anywhere in your deployment.

### 4.3 Guard decorators

```ts
import { HttpController, Get, Post, ContextService } from '@shadow-library/fastify';
import { Authenticated, RequireScope, RequirePermission } from '@shadow-library/auth/module';

@HttpController('/posts')
export class PostController {
  // ContextService resolves when your module has `imports: [FastifyModule]`
  constructor(private readonly context: ContextService) {}

  @Get()
  @Authenticated()                         // any valid bearer token
  list() {
    const who = this.context.getAuthPrincipal(); // { kind, sub, org, sid, scopes, aal, clientId?, claims }
    return this.posts.forOrg(who.org);
  }

  @Post()
  @RequirePermission('posts:write')        // PDP PERMIT required (implies @Authenticated)
  create() { /* … */ }

  @Post('/:id/publish')
  @RequirePermission('posts:publish', { highRisk: true })  // 60 s cache instead of 15 min
  publish() { /* … */ }

  @Post('/internal/reindex')
  @RequireScope('posts:admin')             // M2M callers additionally need an admin-configured access rule (§6.1)
  reindex() { /* … */ }
}
```

| Decorator | Enforces |
| :-- | :-- |
| `@Authenticated()` | A valid, unexpired, correctly-signed bearer token for your `audience` |
| `@RequireScope(...scopes)` | Token carries **every** listed scope |
| `@RequirePermission(action, opts?)` | PDP returns `PERMIT` for `action` in the principal's org. `opts.highRisk` → 60 s cache; `opts.failOpen` → permit when the PDP is unreachable (opt-in, read paths only) |

There is **no per-route caller-allowlist decorator**. Any `kind=service` caller is denied on every authenticated route unless an admin-configured service-access rule covers it (§6.1) — deny-by-default, administered centrally.

**Reading the principal**: the guard stores it in the request-scoped `ContextService`, which the module extends with `getAuthPrincipal()` (throws a 401 `IAM_001` when the route ran unauthenticated) and `getAuthPrincipalOrNull()`. Inject `ContextService` anywhere — controller, service, repository — and read the current caller without threading the request object through your layers.

### 4.4 What the principal looks like {#the-authprincipal}

```ts
interface AuthPrincipal {
  kind: 'user' | 'service';
  sub: string;          // user id or service client id
  scopes: string[];     // from the token's `scope` claim
  clientId?: string;    // OAuth client id
  org?: string;         // active organisation (tenant)
  sid?: string;         // session id (users) — links back to the identity session
  aal?: string;         // 'aal1' | 'aal2' (MFA) authentication assurance
  claims: JwtPayload;   // the raw decoded claims
}
```

### 4.5 Failure behaviour

Every guard failure maps to a deliberately generic response — the body never says which check failed:

- **401** — missing/invalid/expired token (`IAM_001`).
- **403** — authenticated but not permitted: wrong scope, wrong service, or PDP `DENY` (`IAM_002`).

Deny-by-default everywhere. If the PDP is unreachable, `@RequirePermission` fails **closed** unless you explicitly set `failOpen: true`.

---

## 5. Authorization & RBAC

### 5.1 The model

RBAC, scoped to an **organisation** (tenant). Your application defines **permissions** (strings like `posts:write`) and **roles** that map to permission sets. Roles are **assigned** to principals (users or service accounts) within an org. The PDP resolves a decision by walking the principal's active role assignments in that org.

The SDK does this for you inside `@RequirePermission`; you can also inject the `AuthClient` (provided by `AuthModule` under its class token) and ask directly:

```ts
@Injectable()
export class PostService {
  constructor(private readonly auth: AuthClient) {}

  async assertCanWrite(who: AuthPrincipal): Promise<void> {
    const allowed = await this.auth.check({ action: 'posts:write', organisationId: who.org!, principal: who });
    const [canRead, canDelete] = await this.auth.checkAll([
      { action: 'posts:read',   organisationId: who.org!, principal: who },
      { action: 'posts:delete', organisationId: who.org!, principal: who },
    ]);
  }
}
```

Decisions are cached (15 min default / 60 s high-risk) and invalidated automatically when a grant changes (a per-principal `authz_version` rides on every PDP response).

### 5.2 Own your roles in code (recommended)

Instead of an admin hand-creating your roles, declare them in your service and let the SDK push them on startup (decision D-15). Set `roles` on the config:

```ts
AuthModule.forRoot({
  // issuer/audience/client come from AUTH_* env vars
  roles: {
    permissions: [
      { name: 'posts:write',   description: 'Create and edit posts' },
      { name: 'posts:publish', description: 'Publish posts' },
    ],
    roles: [
      { name: 'editor',    description: 'Content editor', permissions: ['posts:write'] },
      { name: 'publisher', description: 'Can publish',    permissions: ['posts:write', 'posts:publish'] },
    ],
  },
});
```

On boot the SDK calls `PUT /api/v1/authz/catalog` (needs the `authz:roles:sync` scope). You can also call `auth.syncRoles(manifest)` yourself from a migration/CI step.

> **⚠️ This is a full declarative sync.** The manifest is the complete truth for **your** application. Any role/permission **not** in it is **deleted** in identity, cascading into live user assignments (with affected principals cache-invalidated). A typo or truncated manifest revokes grants — treat it as production config. It is bounded to your application (derived from your token, never the request body) and every sync is audited.

**Assignments are not managed here.** Granting a role to a specific user stays a deliberate admin operation (`POST /api/v1/admin/role-assignments`) — a service can define roles but never assign privileges to users.

---

## 6. Service-to-service (M2M) calls

Your service holds a service-account client and mints its own tokens to call other services. Inject the `AuthClient` and call by **service name** — inside the cluster the name is the DNS domain:

```ts
@Injectable()
export class SearchGateway {
  constructor(private readonly auth: AuthClient) {}

  reindex(): Promise<Response> {
    // Option A — service discovery + token injection + one automatic retry on a stale-token 401:
    return this.auth.fetchService('search', '/api/v1/reindex', { method: 'POST', body: JSON.stringify({ full: true }) }, { resource: 'api://search', scopes: ['posts:admin'] });
  }

  // Option B — explicit URL and/or raw token:
  async raw(): Promise<string> {
    const url = this.auth.resolveService('search'); // 'http://search' by default
    return this.auth.getServiceToken({ resource: 'api://search', scopes: ['posts:admin'] });
  }
}
```

- **Service discovery**: `resolveService('search')` returns `http://search` (the in-cluster svc DNS name) by default. Override per service with `SERVICE_URL_SEARCH=https://search.example.com` (dashes in the name become underscores) for services outside the cluster or on custom domains; set `SERVICE_DISCOVERY_SUFFIX=.prod.svc.cluster.local` / `SERVICE_DISCOVERY_SCHEME=https` to adjust the cluster default.
- `resource` (RFC 8707) names the **target** API — the minted token's `aud` is set to it, so the callee accepts it. `fetchService` defaults `resource` to the service name.
- `scopes` must be within what your client was **granted** for that resource, or identity refuses.
- Tokens are cached and singleflight-refreshed until ~60 s before expiry; you don't manage rotation.
- Client authentication is your projected SA token (in-cluster) or `client_secret_basic` (outside) — §4.2.

### 6.1 Being called: service-access rules

Which services may call **your** routes is configured by the platform admin in identity (`POST /api/v1/admin/service-access`: your application, the caller's client id, method, path pattern — trailing `*` wildcard). Your `AuthModule` loads these rules at startup and the guard enforces them: a service token hitting any authenticated route without a matching rule gets a 403, even if its scopes are right. Nothing about the caller is hard-coded in your route handlers.

To let `svc-poster` call `POST /api/v1/posts/reindex` on your app, the admin creates the rule and you **restart** (rules load at boot). Combine with `@RequireScope` for defense in depth.

---

## 7. Logging users in (OIDC Authorization Code + PKCE)

First-party apps never touch credentials — they run the OIDC code flow. Use the RP helper for a server-rendered/backend app (`WEB_CONFIDENTIAL`); SPAs use the same flow as a public client (PKCE, no secret).

```ts
import { RelyingPartyModule } from '@shadow-library/auth/module';
import { RelyingParty } from '@shadow-library/auth/rp';

// register once (issuer falls back to AUTH_ISSUER); then inject `RelyingParty` anywhere
RelyingPartyModule.forRoot({
  client: { id: Bun.env.APP_CLIENT_ID!, secret: Bun.env.APP_CLIENT_SECRET },
  redirectUri: 'https://pulse.shadow-apps.com/callback',
  scopes: ['openid', 'profile', 'email'],
});

// 1. Kick off login — store state, nonce, codeVerifier server-side (e.g. in the app session):
const { url, state, nonce, codeVerifier } = await rp.createAuthorizationUrl();
// redirect the browser to `url`

// 2. On the callback, exchange the code (ID token signature + iss/aud/exp/nonce are validated):
const tokens = await rp.exchangeCode({ code, codeVerifier, nonce });
// tokens: { accessToken, idToken, idTokenClaims, refreshToken?, expiresIn, scope? }

// 3. Establish YOUR app's own session from tokens.idTokenClaims — do not reuse identity's cookie.
// 4. Later, rotate access with the refresh token:
const refreshed = await rp.refresh(tokens.refreshToken!);
```

PKCE (`S256`) is mandatory for every client; redirect URIs are exact-match. Store `state`/`nonce`/`codeVerifier` bound to the browser (they're single-use, short-lived).

---

## 8. How verification works under the hood

Useful for reasoning about latency and revocation:

- **JWKS**: fetched from discovery once, keys imported as `CryptoKey` and cached for `jwksTtlSeconds` (12 h). An unknown `kid` triggers **one** immediate refetch (singleflight, 10 s negative cache), so key rotation is zero-config. If the JWKS endpoint is down, cached keys keep working; an unknown `kid` with an unreachable endpoint fails **closed**.
- **Claims**: `EdDSA`-only allowlist (algorithm-confusion precluded), `iss`/`aud`/`exp` (±60 s) always enforced.
- **No hot-path network call** after warm-up. `introspect()` exists only as a fallback for opaque tokens — do **not** use it for routine verification.

### Lifetimes & revocation windows

| Thing | Value | Worst-case staleness |
| :-- | :-- | :-- |
| User access token | 60 min | Revoked session works until token expiry |
| JWKS cache (SDK) | 12 h | Un-published key trusted until refetch |
| PDP decision cache | 15 min (60 s high-risk) | Revoked grant permits until entry expires* |
| M2M access token | 60 min | — |

\* `authz_version` piggybacking collapses this to one round-trip once the principal has any other PDP traffic, so 15 min is the no-other-traffic worst case. Need faster? Mark the route `highRisk`. The platform-wide path to instant, event-driven revocation is CAEP/SSF (future — `architecture.md` §9.1).

---

## 9. Testing your integration

The SDK ships an **in-process mock identity provider** so you can test guards and flows without a running identity service:

```ts
import { createTestIdP } from '@shadow-library/auth/testing';
import { AuthClient } from '@shadow-library/auth';

const idp = await createTestIdP();                 // ephemeral Ed25519 key + discovery/JWKS/token/PDP
const auth = new AuthClient({ issuer: idp.issuer, audience: 'api://pulse' });

const token = await idp.issueToken({ sub: 'u1', audience: 'api://pulse', scopes: ['posts:write'], org: '7' });
const principal = await auth.verify(token);         // → resolves offline

idp.grantPermission({ kind: 'user', sub: 'u1' }, '7', 'posts:write'); // PDP answers PERMIT
idp.stop();
```

It supports token minting, key rotation, grant/deny, injected endpoint failures, service-access rules (`idp.setServiceAccess([...])`), and request counting — enough to test the full guard matrix.

---

## 10. Integration checklist

- [ ] Ask the platform admin to register your service; capture **client id**, **API resource (`audience`)**, and **redirect URIs**. In-cluster: give the admin your SA subject for the **`workloadSubject`** binding (no secret); outside: capture the **secret**.
- [ ] Have `authz:check` granted to your client if you use `@RequirePermission` (also needed to load service-access rules); `authz:roles:sync` if you push a role catalog.
- [ ] Have the admin create **service-access rules** for every service that must call you.
- [ ] `bun add @shadow-library/auth`.
- [ ] Add `AuthModule.forRoot()` inside `FastifyModule.forRoot`.
- [ ] Set `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_CLIENT_ID`, and `AUTH_CLIENT_ASSERTION_PATH` (projected SA token) or `AUTH_CLIENT_SECRET`.
- [ ] Annotate routes: `@Authenticated`, `@RequireScope`, `@RequirePermission` (mark sensitive ones `highRisk`).
- [ ] Read the caller via `context.getAuthPrincipal()` (inject `ContextService`); scope every query by `principal.org`.
- [ ] Declare your `roles` catalog in config (declarative sync — mind the delete semantics).
- [ ] For outbound calls, use `auth.fetchService(name, path, init, { resource, scopes })`; add `SERVICE_URL_<NAME>` overrides for anything outside the cluster.
- [ ] For user login, register `RelyingPartyModule.forRoot(...)` and establish **your own** app session.
- [ ] Write guard tests against `createTestIdP`.

---

## 11. Troubleshooting

| Symptom | Likely cause |
| :-- | :-- |
| All requests 401 | `audience` mismatch (token `aud` ≠ your resource), wrong `issuer`, or clock skew > 60 s |
| `@RequirePermission` always 403 | Your client lacks the `authz:check` scope, or the user genuinely has no assigned role granting the action |
| `AppError` with `AuthErrorCode.KEY_UNKNOWN` | Token signed by a key not in identity's JWKS (rotation gap, or token from a different environment) |
| `syncRoles` → `ROLE_SYNC_FAILED` / 403 | Missing `authz:roles:sync` scope, or a role references a permission not declared in the same manifest |
| Revoked user still works for a bit | Expected — bounded by the token TTL (≤ 60 min) / PDP cache (≤ 15 min); use `highRisk` for faster cutoff |
| M2M call 403 | Requested `scopes` exceed what your client was granted for that `resource`, or the callee has no service-access rule for your client + method + path (or hasn't restarted since it was added) |
| Token endpoint 401 with SA token | `workloadSubject` not bound (or wrong), projected volume `audience` ≠ identity issuer, or identity's `AUTH_WORKLOAD_ISSUER` doesn't trust your cluster |
| `fetchService` hits the wrong host | Missing `SERVICE_URL_<NAME>` override (dashes → underscores) or wrong `SERVICE_DISCOVERY_SUFFIX` |
| Boot fails at startup with `SERVICE_ACCESS_FAILED` | Your client lacks `authz:check`, or identity is unreachable — the module aborts rather than silently denying all M2M callers |

`AuthError.code` values you may catch: `TOKEN_EXPIRED`, `TOKEN_INVALID`, `AUDIENCE_MISMATCH`, `ISSUER_MISMATCH`, `ALG_REJECTED`, `KEY_UNKNOWN`, `PDP_UNAVAILABLE`, `ROLE_SYNC_FAILED`, `SERVICE_ACCESS_FAILED`, `SERVICE_UNKNOWN`, `CONFIG_INVALID`, `TOKEN_REQUEST_FAILED`.
