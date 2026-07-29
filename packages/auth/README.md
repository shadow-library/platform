# `@shadow-library/auth`

The consumer SDK for the Shadow Apps identity platform. Every Shadow Apps service uses this package — and only this package — to authenticate users and services and to enforce permissions. It is the policy-enforcement-point (PEP) half of the platform; [Shadow Identity](https://github.com/shadow-library/identity-server#readme) is the decision half.

The full specification lives in [`docs/sdk.md`](https://github.com/shadow-library/identity-server/blob/main/docs/sdk.md); the task-oriented walkthrough in [`docs/service-integration-guide.md`](https://github.com/shadow-library/identity-server/blob/main/docs/service-integration-guide.md).

## Install

```sh
bun add @shadow-library/auth
```

The package is Bun-first: EdDSA (Ed25519) verification runs on `crypto.subtle` and transport is native `fetch`. `@shadow-library/common` is a required peer (SDK errors are `AppError`s thrown by `AuthErrorCode` keys); the `@shadow-library/app`/`fastify`/`class-schema` peers are only needed when you use the framework module.

## Functional core

```ts
import { AuthClient } from '@shadow-library/auth';

// usually constructed by AuthModule.forRoot() and injected; constructable directly for plain Bun processes
const auth = new AuthClient({
  issuer: 'https://identity.shadow-apps.com',
  appId: 'svc-pulse', // audience, redirect URIs and granted scopes are read back from identity
  // in-cluster: projected k8s SA token as RFC 7523 client assertion; outside: { id, secret }
  client: { id: 'svc-pulse', assertionPath: '/var/run/secrets/shadow/identity-token' },
});

const principal = await auth.verify(bearerToken); // → AuthPrincipal, throws AppError with an AuthErrorCode key
const allowed = await auth.check({ action: 'posts:write', organisationId: principal.org, principal }); // → boolean, deny-by-default
const token = await auth.getServiceToken({ resource: 'api://novel-forge', scopes: ['books:read'] }); // cached + singleflight
const response = await auth.fetchService('novel-forge', '/api/v1/books', {}, { resource: 'api://novel-forge' }); // → APIResponse; svc:// resolution + token, one retry on 401
```

### Calling another application as the user

`fetchService` and `getServiceToken` speak as the *service*. To act for the user in a downstream application, exchange their token — this is the only supported way, because forwarding the user's own token gives the receiving API an audience that is not its own, and asserting the user in a header is forbidden outright:

```ts
const { accessToken, scope } = await auth.exchangeUserToken({
  subjectToken: bearerTokenThisServiceReceived,
  resource: 'api://novel-forge',
  scopes: ['books:read'],
});
```

Identity **narrows the scope silently** — it intersects what you asked for with what the user and this application both hold — so read `scope` rather than assuming you got what you requested. Delegation is single-hop: a subject token that already carries `act` is refused locally with `TOKEN_EXCHANGE_REFUSED` before any network call. The result is never cached; it belongs to one user, is short-lived, and its `exp` is capped by its subject's.

`fetchService` calls the service over the `svc://<name>/<path>` scheme, which APIRequest resolves to `http://<name>` (the in-cluster svc domain) by default; override per service with a `SERVICE_URL_<NAME>` env variable, or point a `svc://<name>.<namespace>/…` host at another namespace.

### Request timeouts

Pass `timeout` (milliseconds, also settable via `AUTH_TIMEOUT`) to bound **every** outbound request the client makes — discovery, JWKS, token minting, PDP checks, `fetch`, and `fetchService` — with one total time budget per attempt. A fresh budget is armed for each call, so the automatic 401 retry gets the full budget rather than sharing one clock. Transport calls surface their path's failure error (e.g. `DISCOVERY_FAILED`, `TOKEN_REQUEST_FAILED`) on expiry, while `fetchService` surfaces the common package's retryable `API_REQUEST_TIMEOUT` (504). Left unset, requests are unbounded.

```ts
const auth = new AuthClient({ issuer, audience, client, timeout: 5000 }); // abort any request that runs longer than 5s
```

`RelyingParty` takes the same `timeout` option, bounding its discovery, JWKS, and token-exchange calls.

## User login — the whole integration

A service gets complete user authentication by importing one module and setting environment variables. There is no login route to write, no callback to parse, no cookie code, no token cache, no logout handler and no middleware to register.

```ts
FastifyModule.forRoot({
  imports: [
    AuthModule.forRoot(),
    // ...the app's own modules
  ],
});
```

```sh
AUTH_ISSUER=https://identity.shadow-apps.com
AUTH_APP_ID=svc-reports
AUTH_CLIENT_ASSERTION_PATH=/var/run/secrets/shadow/identity-token   # or AUTH_CLIENT_SECRET outside the cluster
```

That is the whole of a steady-state deployment. The audience this service's tokens are addressed to, the redirect URIs an admin registered, the scopes an admin granted and the step-up endpoint are all **read back from identity** at startup (`GET /api/v1/apps/me` plus discovery) and refreshed on a TTL, so an admin granting a scope reaches a running service without a redeploy. Add `AUTH_ALLOWED_REDIRECTS` when a `return_to` may leave this origin — that allow-list is genuinely local policy.

That registers, wired and working:

| Route | Behaviour |
| :--- | :--- |
| `GET /auth/login` | PKCE + `state` + `nonce` + `resource`, transient state into its own cookie, redirect to identity |
| `GET /auth/callback` | Validates `state`, redeems the code for an app-session handle, sets the session cookie, returns to `return_to` |
| `POST /auth/logout` | Revokes the app session, clears the cookies, optionally hands on to identity's RP-initiated logout |
| `POST /auth/backchannel-logout` | Verifies the OIDC logout token and drops that user's local sessions and cached tokens |
| `GET /auth/session` | The current principal, or `401` — so a browser client never has to parse a token |
| `GET /auth/step-up` | Claims a step-up grant, prompting identity only when there is nothing left to claim |
| `GET /auth/organisations` | The organisations this session may act in, active one flagged; one entry means there is nothing to switch to |
| `POST /auth/organisation` | Switches the active organisation and replaces the session cookie — identity rotates the handle, so the previous one is dead |

Permissions are always evaluated in the session's **active organisation**, so switching changes what the whole application may do. Identity rotates the session handle on a switch and the SDK evicts its cached tokens: an application caches minted tokens against the handle, and a switch served by one replica can never reach a sibling replica's cache, so a handle nobody will present again is the only thing that invalidates everywhere at once. A refused switch answers `403 ORGANISATION_NOT_PERMITTED`, distinct from a `503` outage, so a picker can tell the two apart.

Everything is overridable and nothing is required: `AuthModule.forRoot({ routes: { basePath: '/session', backchannelLogout: false } })` moves or disables any of them, and `browser: { redirectUri, scopes, stepUpUrl, … }` pins in code anything the registration would otherwise supply — the escape hatch lives in code, where it is visible and reviewed, rather than in an environment variable a stale deploy can silently keep overriding. An API-only service sets `AUTH_BROWSER_LOGIN=false` (or `browser: { enabled: false }`) and gets none of it; a service with no credential at all never had a login it could complete, so the routes are not offered either.

### How a browser request is served

The session cookie holds an **opaque app-session handle**, never a token. On each request the SDK mints (or serves from cache) an access token for this app's own audience, authenticating to identity with the service's *own* M2M credential, and verifies the result offline. Possessing a handle grants nothing on its own — that split is the security property the model rests on.

The transient login-state cookie (`state`, PKCE verifier, `return_to`) carries no credential and needs no key: the `__Host-` prefix — a browser-enforced promise that only this exact origin over https could have set it — is what defeats login-CSRF by cookie injection, and a leaked verifier is inert because redeeming the code requires the application's own M2M credential. There is no `AUTH_SESSION_SECRET` and no server-side store, so a login started on one replica completes on any other.

The cookie defaults to `__Host-`-prefixed, `Secure`, `HttpOnly`, `SameSite=Lax`. Because a cookie is now a credential on guarded routes, `SameSite` is what stands between you and CSRF: keep it at `Lax` or `Strict`, and if a deployment genuinely needs `None` (a cross-site iframe), the application must supply its own CSRF defence on every state-changing route — the SDK warns at startup when it sees it. `AUTH_SESSION_COOKIE_SECURE=false` exists only for plain-HTTP development; it drops the `__Host-` prefix with it and says so loudly.

Minting **narrows silently**: identity answers 200 with whatever scope survived filtering rather than refusing, so `AppSessionToken.grantedScopes` carries what was actually granted and the SDK logs the delta at warn on every narrowing. Cached tokens are filed under the **granted** scope, never the requested one — a cache that labelled an entry `reports:read reports:write` while holding only `reports:read` would be lying about its own contents. Set `strictScopes: true` (or `AUTH_STRICT_SCOPES=true`) where a partial grant is worse than an outright failure and a narrowed mint throws `SCOPE_NOT_GRANTED` instead.

Both credentials land in the same principal, so a route handler never learns which the caller used:

```ts
@Get()
@Authenticated()          // works for an Authorization: Bearer token and for the session cookie alike
list() {
  return this.context.getAuthPrincipal();
}
```

### Step-up (AAL2)

```ts
@Post('/transfer')
@RequireElevation()
transfer() {} // principal.aal === 'AAL2', guaranteed
```

A browser is bounced to `/auth/step-up`, which claims the user's step-up into a grant scoped to **this app session and this audience**, then retries. A non-browser caller gets `403 IAM_003` instead and can drive the same cycle itself.

The prompt identity is handed names its beneficiary — `client_id` and `resource` travel alongside `return_to` — so a window one application prompted for cannot be claimed by another that happens to ask first. A claim rejected for intent mismatch (`ELEVATION_INTENT_MISMATCH`) restarts the prompt rather than retrying, because retrying a claim can never fix it; the restart happens exactly once.

Elevation never spreads: the elevated token is minted for the routes that ask for it, is cached under a separate key so it can never answer an ordinary request, and dies with its grant window. A user working across two applications therefore steps up in each — that is the cost of the isolation, not a bug to work around.

## Framework guards

```ts
import { ContextService } from '@shadow-library/fastify';
import { AuthModule, Authenticated, RequirePermission, RequireScope } from '@shadow-library/auth/module';

// issuer, audience, and client resolve from AUTH_ISSUER / AUTH_AUDIENCE / AUTH_CLIENT_* env vars
export const HttpModule = FastifyModule.forRoot({ imports: [AuthModule.forRoot(), PostModule] });

@HttpController('/posts')
class PostController {
  constructor(private readonly context: ContextService) {}

  @Get()
  @Authenticated()
  list() {
    const who = this.context.getAuthPrincipal(); // installed by AuthModule; throws 401 when unauthenticated
  }

  @Post()
  @RequirePermission('posts:write')
  create() {}

  @Post('/internal/reindex')
  @RequireScope('posts:admin') // M2M callers also need an admin-configured service-access rule
  reindex() {}
}
```

`AuthModule.forRoot(...)` must be imported inside `FastifyModule.forRoot({ imports: [...] })` so the guard middleware registers against the HTTP routes. Which M2M caller may reach which route is administered centrally in the identity admin panel and loaded at startup — there is no per-route caller allowlist in code.

## OIDC relying party — third-party consumers only

**A Shadow app never uses this.** It logs users in through `AuthModule`'s browser routes, exchanges the code for an opaque app-session handle, and holds no tokens at rest. `RelyingParty` is the standard OIDC token-pair flow for everything else: third-party clients, SPAs, and non-Shadow consumers. Reaching for it inside a Shadow app means reintroducing the token pair the first-party model exists to remove, and hand-writing the login, cookie and cache code `AuthModule.forRoot()` already provides.

```ts
import { RelyingPartyModule } from '@shadow-library/auth/module';
import { RelyingParty } from '@shadow-library/auth/rp';

// as a provider (issuer falls back to AUTH_ISSUER):
RelyingPartyModule.forRoot({ client, redirectUri: 'https://pulse.shadow-apps.com/auth/callback' });

// or directly:
const rp = new RelyingParty({ issuer, client, redirectUri: 'https://pulse.shadow-apps.com/auth/callback' });
const request = await rp.createAuthorizationUrl(); // PKCE S256 + state + nonce
const tokens = await rp.exchangeCode({ code, codeVerifier: request.codeVerifier, nonce: request.nonce });
```

## Test utilities

```ts
import { createTestIdP } from '@shadow-library/auth/testing';

const idp = await createTestIdP({ clientId: 'svc-pulse', clientSecret: 's3cr3t', app: { audience: 'api://pulse', scopes: ['posts:read'] } });
const auth = new AuthClient({ issuer: idp.issuer, appId: 'svc-pulse', client: { id: 'svc-pulse', secret: 's3cr3t' } });
const token = await idp.issueToken({ sub: '42', audience: 'api://pulse', scopes: ['posts:read'] });
await auth.verify(token);
idp.setServiceAccess([{ callerClientId: 'svc-indexer', method: 'POST', path: '/api/v1/index' }]);
idp.stop();
```

The mock stands in for the whole v1.1 surface, so a service can integration-test its browser flow, its guards and its M2M paths without a live identity service:

```ts
// derived configuration (A-3): apps/me + the step_up_endpoint / app_session_endpoint discovery keys
idp.setAppRegistration({ scopes: ['openid', 'posts:write'] }); // an admin's grant change, mid-test

// intent-bound step-up (A-2): a window prompted for by one app cannot be claimed by another
idp.setSteppedUp('user-42', { clientId: 'svc-reports', resource: 'api://reports' }); // `true` matches any claimant
idp.getLastElevationRequest(); // what the claim actually asked for

// token exchange (A-5): scope intersection and the single-hop refusal
idp.setUnexchangeableScopes(['posts:write']);

// catalog sync (A-6): identity's destructive-sync guardrail
idp.setCatalogGuardrail(true); // syncRoles now answers ROLE_SYNC_REFUSED until { force: true }

// "a handle alone grants nothing" — a transport that drops the app's own bearer on app-session routes
new AuthClient({ issuer: idp.issuer, appId, client, fetch: idp.handleOnlyTransport() });

// rule-refresh timing (A-1): wait for the scheduled refresh instead of sleeping past it
await idp.waitForRequest('/api/v1/authz/service-access', 2);

idp.endIdentitySession('user-42'); // every app session of that user starts answering AUTH_005
idp.getAppSessionCount(); // asserts a revocation actually reached identity
```

## Migration

### 0.4 — derived configuration (breaking)

Four environment variables are **removed**, not deprecated:

| Removed                | Now                                                                                    |
| :--------------------- | :------------------------------------------------------------------------------------- |
| `AUTH_AUDIENCE`        | derived from `GET /api/v1/apps/me`; pin with `audience` in code if a deploy truly needs |
| `AUTH_REDIRECT_URI`    | derived from the registered redirect URIs; pin with `browser.redirectUri`               |
| `AUTH_SCOPES`          | the scopes an admin granted this application; narrow with `browser.scopes`              |
| `AUTH_STEP_UP_URL`     | discovery's `step_up_endpoint`; pin with `browser.stepUpUrl`                            |
| `AUTH_SESSION_SECRET`  | nothing — the login-state cookie no longer needs a key or a store                      |

Add `AUTH_APP_ID` (required in production; it doubles as the OAuth client id, so `AUTH_CLIENT_ID` is only needed when the two differ). A deploy is then `AUTH_ISSUER` + `AUTH_APP_ID` + one credential. There is no fallback reading of the old variables — a stale value silently overriding what identity says is worse than no override, so the escape hatches live in code where they are visible and reviewed.

Other breaking changes on this line:

- **`AUTH_BROWSER_LOGIN` replaces "set a redirect URI to switch login on".** The browser flow is on whenever a credential is configured; an API-only service sets `AUTH_BROWSER_LOGIN=false` or `browser: { enabled: false }`.
- **`routes.backchannelLogout` defaults off.** First-party revocation is pull-based — identity ends the central session and the next mint fails — so it never posts a logout token to an app-session client. Turn it on explicitly if you serve the third-party `RelyingParty` path.
- **`ResolvedBrowserAuthConfig` no longer carries `clientId`, `audience`, `redirectUri`, `scopes` or `stepUpUrl`**, and `AppSessionService.identityStepUpUrl()` is async. `LoginStateStore`, `SealedLoginStateStore` and `InMemoryLoginStateStore` are gone.
- **`AppSessionToken.grantedScopes` is required**, and the token cache is keyed by the granted scope.

### Token requests are form-encoded (breaking)

`/oauth2/*` now requires `application/x-www-form-urlencoded` bodies per RFC 6749 §2.3.1; identity accepts JSON for one more release and logs it as deprecated. `RelyingParty.exchangeCode`/`refresh` and the M2M `ServiceTokenManager` both send form-encoded bodies as of this version — **upgrading is required before that deprecation window closes**. Client secrets still travel in an HTTP Basic header, keeping them out of the body. No call sites change.

### First-party clients get no refresh tokens

A first-party application now exchanges its authorization code for an opaque app-session handle rather than a token pair, and is issued **no refresh token** — the handle is the renewal credential, and the SDK mints from it as needed. There is deliberately no refresh path on the app-session flow. `RelyingParty.refresh()` is unchanged and remains correct for third-party and SPA clients, whose refresh tokens are now 15-day idle and bounded by the identity session that issued them.

If you were storing a token in your own session cookie, delete that code: the SDK's cookie holds a handle, and tokens live only in its in-memory cache.

### Introspection is caller-scoped

`introspection_endpoint` and `revocation_endpoint` are now read from discovery rather than assumed at `${issuer}/oauth2/…`. Introspection remains an explicit fallback for opaque tokens and must not be used for routine verification — and it now only answers about tokens this client owns; another client's token reads as `active: false`.
