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
  audience: 'api://pulse',
  // in-cluster: projected k8s SA token as RFC 7523 client assertion; outside: { id, secret }
  client: { id: Bun.env.AUTH_CLIENT_ID!, assertionPath: '/var/run/secrets/shadow/identity-token' },
});

const principal = await auth.verify(bearerToken); // → AuthPrincipal, throws AppError with an AuthErrorCode key
const allowed = await auth.check({ action: 'posts:write', organisationId: principal.org, principal }); // → boolean, deny-by-default
const token = await auth.getServiceToken({ resource: 'api://novel-forge', scopes: ['books:read'] }); // cached + singleflight
const response = await auth.fetchService('novel-forge', '/api/v1/books', {}, { resource: 'api://novel-forge' }); // → APIResponse; svc:// resolution + token, one retry on 401
```

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
AUTH_AUDIENCE=api://reports              # this service's own API resource
AUTH_CLIENT_ID=svc-reports
AUTH_CLIENT_ASSERTION_PATH=/var/run/secrets/shadow/identity-token   # or AUTH_CLIENT_SECRET
AUTH_REDIRECT_URI=https://reports.shadow-apps.com/auth/callback     # setting this turns the browser flow on
AUTH_SCOPES="openid reports:read"
AUTH_ALLOWED_REDIRECTS=https://reports.shadow-apps.com              # the `return_to` allow-list
```

That registers, wired and working:

| Route | Behaviour |
| :--- | :--- |
| `GET /auth/login` | PKCE + `state` + `nonce` + `resource`, transient state into its own cookie, redirect to identity |
| `GET /auth/callback` | Validates `state`, redeems the code for an app-session handle, sets the session cookie, returns to `return_to` |
| `POST /auth/logout` | Revokes the app session, clears the cookies, optionally hands on to identity's RP-initiated logout |
| `POST /auth/backchannel-logout` | Verifies the OIDC logout token and drops that user's local sessions and cached tokens |
| `GET /auth/session` | The current principal, or `401` — so a browser client never has to parse a token |
| `GET /auth/step-up` | Claims a step-up grant, prompting identity only when there is nothing left to claim |

Everything is overridable and nothing is required: `AuthModule.forRoot({ routes: { basePath: '/session', backchannelLogout: false } })` moves or disables any of them, and `browser: { … }` overrides any of the `AUTH_*` values in code. A service that sets no `AUTH_REDIRECT_URI` gets none of it — the API-only integration below is unchanged.

### How a browser request is served

The session cookie holds an **opaque app-session handle**, never a token. On each request the SDK mints (or serves from cache) an access token for this app's own audience, authenticating to identity with the service's *own* M2M credential, and verifies the result offline. Possessing a handle grants nothing on its own — that split is the security property the model rests on.

The transient login-state cookie (`state`, PKCE verifier, `return_to`) carries no credential and needs no key: the `__Host-` prefix — a browser-enforced promise that only this exact origin over https could have set it — is what defeats login-CSRF by cookie injection, and a leaked verifier is inert because redeeming the code requires the application's own M2M credential. There is no `AUTH_SESSION_SECRET` and no server-side store, so a login started on one replica completes on any other.

The cookie defaults to `__Host-`-prefixed, `Secure`, `HttpOnly`, `SameSite=Lax`. Because a cookie is now a credential on guarded routes, `SameSite` is what stands between you and CSRF: keep it at `Lax` or `Strict`, and if a deployment genuinely needs `None` (a cross-site iframe), the application must supply its own CSRF defence on every state-changing route — the SDK warns at startup when it sees it. `AUTH_SESSION_COOKIE_SECURE=false` exists only for plain-HTTP development; it drops the `__Host-` prefix with it and says so loudly.

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

## OIDC relying party

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

const idp = await createTestIdP();
const auth = new AuthClient({ issuer: idp.issuer, audience: 'api://pulse' });
const token = await idp.issueToken({ sub: '42', audience: 'api://pulse', scopes: ['posts:read'] });
await auth.verify(token);
idp.setServiceAccess([{ callerClientId: 'svc-indexer', method: 'POST', path: '/api/v1/index' }]);
idp.stop();
```

The mock also stands in for the app-session endpoints, so a service can integration-test its whole browser flow without a live identity service:

```ts
idp.setSteppedUp('user-42', true); // the next elevation claim succeeds
idp.endIdentitySession('user-42'); // every app session of that user starts answering AUTH_005
const logoutToken = await idp.issueLogoutToken({ sub: 'user-42' });
idp.getAppSessionCount(); // asserts a revocation actually reached identity
```

## Migration

### Token requests are form-encoded (breaking)

`/oauth2/*` now requires `application/x-www-form-urlencoded` bodies per RFC 6749 §2.3.1; identity accepts JSON for one more release and logs it as deprecated. `RelyingParty.exchangeCode`/`refresh` and the M2M `ServiceTokenManager` both send form-encoded bodies as of this version — **upgrading is required before that deprecation window closes**. Client secrets still travel in an HTTP Basic header, keeping them out of the body. No call sites change.

### First-party clients get no refresh tokens

A first-party application now exchanges its authorization code for an opaque app-session handle rather than a token pair, and is issued **no refresh token** — the handle is the renewal credential, and the SDK mints from it as needed. There is deliberately no refresh path on the app-session flow. `RelyingParty.refresh()` is unchanged and remains correct for third-party and SPA clients, whose refresh tokens are now 15-day idle and bounded by the identity session that issued them.

If you were storing a token in your own session cookie, delete that code: the SDK's cookie holds a handle, and tokens live only in its in-memory cache.

### Introspection is caller-scoped

`introspection_endpoint` and `revocation_endpoint` are now read from discovery rather than assumed at `${issuer}/oauth2/…`. Introspection remains an explicit fallback for opaque tokens and must not be used for routine verification — and it now only answers about tokens this client owns; another client's token reads as `active: false`.
