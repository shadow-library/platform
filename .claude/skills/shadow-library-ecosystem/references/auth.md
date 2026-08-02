# Auth reference — integrating a Shadow app with Shadow Identity

Load this whenever a task touches login, route protection, service-to-service calls, permissions, or
step-up. Facts here are verified against `apps/identity-server` and `packages/auth` source, not their
docs — several identity docs are stale and are called out in §11.

**Every application in this ecosystem is a first-party application.** There is exactly one supported
way to log a user in, and it is not the textbook OIDC flow.

## 1. The prime directive

```ts
// This, plus AUTH_* environment variables, is the ENTIRE integration.
FastifyModule.forRoot({
  imports: [AuthModule.forRoot(), /* the app's own modules */],
});
```

`AuthModule.forRoot()` registers the guard middleware **and** the browser-facing auth routes, manages the
session cookie, caches minted tokens, and drives step-up. A service writes no auth code.

MUST NOT, in any Shadow app:

- hand-write a `/login`, `/callback`, or `/logout` route,
- use `RelyingParty` (`@shadow-library/auth/rp`) — it exchanges the code for a **token pair**, which is
  the third-party flow; a first-party app must exchange it for an app-session handle,
- put a JWT (or any token) in a cookie — the cookie carries an **opaque handle**,
- store a refresh token — first-party clients are issued none (D-18),
- read `process.env` for auth config, or hand-roll a session store.

## 2. Why first-party is different (D-18/D-19)

A first-party app exchanges its authorization code for an opaque **app-session handle**, held in a cookie
on its own domain. It holds no tokens at rest. Every time it needs an access token it calls identity
server-to-server, authenticating with **its own M2M credential** plus the handle.

Consequences that drive the design:

- **A stolen handle is inert.** Minting needs the app's M2M credential too, and the handle is bound to the
  issuing `client_id` — presenting it as another client reads as unknown.
- **The app is stateless per user.** No session table, no refresh-token store.
- **Identity stays authoritative.** Every mint re-validates the central session, so a global sign-out
  stops issuance everywhere within one token TTL.
- **Elevation never crosses a service boundary.** A step-up is *spent* into a grant for one
  `(app session, audience)` pair; a second app cannot ride it, and the same app cannot reuse it for a
  different API.

## 3. Identity-side registration (do this before any code)

**One client per application, not two.** `OAuthClientService.provisionApplicationIdentity` (
`apps/identity-server/src/modules/auth/oauth/oauth-client.service.ts:279`) provisions "exactly one
client and exactly one API resource" per application, with the client id equal to the application name
and the resource identifier derived as `api://<app>` — never configured separately. The method's own
comment states why the old model is gone: "splitting a product into an `<app>` and an `<app>-server`
client only ever created ambiguity about which of the two an id referred to." The single client is
registered `kind: 'WEB_CONFIDENTIAL'` with `grantTypes: ['authorization_code', 'client_credentials',
<token-exchange grant>]` — it runs both the browser code flow and the server-to-server calls, because
they're one deployment and therefore one identity. `tasks.md:363` documents the migration concretely:
"Pulse holds one client (`pulse`, `authorization_code` + `client_credentials` + token-exchange, granted
`authz:check`, `authz:roles:sync` and `app-session:manage`) instead of the `pulse` / `pulse-server`
pair." If you see admin docs describing two separate clients (a `WEB_CONFIDENTIAL` `<app>` plus a
`SERVICE` `<app>-server`), that's the retired model — don't propagate it.

This is provisioned by `POST /api/v1/admin/applications` (creating the application also provisions its
client+resource in the same call — see `admin-application.controller.ts`'s `createApplication`), not a
separate `POST /api/v1/admin/clients` step.

Also required, all admin operations:

- The client id **is** the application `name` — it must match `CLIENT_ID_PATTERN`
  (`/^[a-z0-9]([a-z0-9-]{1,62}[a-z0-9])?$/`, `oauth-client.service.ts:112`), not a generated UUID.
- **Scopes** created on the application's `api://<app>` resource, and **granted to its client**. Mark a
  scope `is_sensitive` when it must only ever be mintable into an elevated token.
- The scope **`app-session:manage` granted to the client** — without it every mint fails. For the three
  ecosystem apps this is already done: `EcosystemSeedService.ensureAppClient` grants `scopes.appSession`
  to pulse (`ecosystem-seed.service.ts:180`), novel-forge (`:296`), and web-novel (`:301`) as part of
  their seed. A newly registered app still needs it granted explicitly by an admin.
- `authz:check` (PDP + service-access rules) and `authz:roles:sync` (role-catalog push) if used. Method-level
  scope **replaces** class-level on identity's side, so the catalog push needs `authz:roles:sync` *only*.
- `redirect_uris` are matched **exactly** — absolute, no fragment. Derived from the application's
  registered public origins (`${origin}/api/auth/callback`), not hand-entered.
- Service-access rules (`/api/v1/admin/service-access`) for every M2M caller allowed to reach this service.
  Deny-by-default; granting a caller needs an admin change **plus a restart** of the target service.

In-cluster the preferred credential is **workload identity**: `EcosystemSeedService` binds the seeded
client's `workloadSubjects` to `system:serviceaccount:<ns>:<name>` and the app sets
`AUTH_CLIENT_ASSERTION_PATH` to the projected SA token. No long-lived secret then exists on either side.
`client_secret_basic` (`AUTH_CLIENT_SECRET`) is for workloads outside the cluster.

## 4. Configuration

The SDK's config keys and their env-var mapping live in `packages/auth/src/module/config.ts` (`Config.load`
calls at lines 144–171). A steady-state deploy sets three things plus one credential — everything else
identity already knows about the application and the SDK reads it back at runtime (D-21):

| Env | Config key | Meaning |
| --- | --- | --- |
| `AUTH_ISSUER` | `auth.issuer` | Identity base URL. MUST match identity's own issuer **exactly** — a trailing-slash mismatch is a blanket 401. |
| `AUTH_APP_ID` | `auth.app-id` (`isProdRequired: true`) | This application's registered name at identity; doubles as the OAuth client id. **The one required-in-prod key** — without it a service can't read its own registration back and so can't know its own audience. |
| `AUTH_CLIENT_SECRET` | `auth.client.secret` | Static client secret — outside the cluster only. |
| `AUTH_CLIENT_ASSERTION_PATH` | `auth.client.assertion-path` | Projected k8s SA token — preferred in-cluster. |
| `AUTH_CLIENT_ID` | `auth.client.id` | Rare override — the client id defaults to `AUTH_APP_ID`; only needed if the two must differ. |
| `AUTH_IDENTITY_URL` | `auth.identity-url` | Back-channel base URL when it differs from the public issuer (e.g. in-cluster `svc://identity-server.identity`). Unset outside a cluster. |
| `AUTH_TIMEOUT` | `auth.timeout` | Total ms budget per outbound request. |
| `AUTH_APP_REFRESH_SECONDS` | `auth.app.refresh-seconds` (default 300) | How often the cached app registration (audience/redirects/scopes/step-up endpoint) refreshes from identity. |
| `AUTH_SERVICE_ACCESS_REFRESH_SECONDS` | `auth.service-access.refresh-seconds` (default 300) | Same, for the service-access rule cache. |
| `AUTH_STRICT_SCOPES` | `auth.strict-scopes` (default `false`) | — |
| `AUTH_BROWSER_LOGIN` | `auth.browser-login` (default `true`) | Gates the browser routes — see below; this env var is the override, not a redirect-URI condition. |
| `AUTH_SESSION_COOKIE_NAME` | `auth.session.cookie-name` | Defaults to `__Host-shadow-session`. |
| `AUTH_SESSION_COOKIE_SECURE` | `auth.session.cookie-secure` (default `true`) | Escape hatch for plain-HTTP dev only; drops the `Secure` attribute and therefore the `__Host-` prefix, and warns loudly. |
| `AUTH_SESSION_COOKIE_SAME_SITE` | `auth.session.cookie-same-site` | `Lax` (default) / `Strict` / `None`. |
| `AUTH_SESSION_COOKIE_DOMAIN` | `auth.session.cookie-domain` | — |
| `AUTH_POST_LOGIN_REDIRECT` | `auth.post-login-redirect` | Default landing path (`/`). |
| `AUTH_POST_LOGOUT_REDIRECT` | `auth.post-logout-redirect` | Where identity sends the browser after an RP-initiated logout. |
| `AUTH_ALLOWED_REDIRECTS` | `auth.allowed-redirects` (CSV) | Comma-separated `return_to` allow-list. Same-origin paths are always allowed. |

**`AUTH_AUDIENCE`, `AUTH_REDIRECT_URI`, `AUTH_SCOPES`, and `AUTH_STEP_UP_URL` do not exist.** They are
retired, not deprecated (`config.ts:128–139`, its own block comment): the audience, redirect URIs,
granted scopes, and step-up endpoint are read back from identity — `GET /api/v1/apps/me`, fetched by the
SDK's own `AppRegistryClient` (`AuthClient.getAppRegistration()`, `auth-client.ts:184`) — rather than
restated in env vars, because "a stale value in a deploy silently overriding what identity says is worse
than having no override at all." **`AUTH_SESSION_SECRET` does not exist either** — the login-state cookie
needs no sealing key; see §11.14. The escape hatch for all four is `browser: { redirectUri, scopes,
stepUpUrl }` in code (`AuthModule.forRoot({ browser: {...} })`), visible and reviewed, not an env var.

Anything settable by env is overridable in code via `AuthModule.forRoot({ browser: { … }, routes: { … } })`
— code wins. Config MUST be read through `Config` — never `process.env`.

## 5. What gets registered

| Route | Behaviour |
| --- | --- |
| `GET /auth/login` | PKCE + `state` + `nonce` + `resource`; transient state cookie set (see §11.14); redirect to identity. |
| `GET /auth/callback` | Validates `state`, redeems the code for a handle, sets the session cookie, returns to `return_to`. |
| `POST /auth/logout` | Revokes the app session and clears the cookies. |
| `POST /auth/backchannel-logout` | Verifies an OIDC logout token and drops matching local sessions. **Off by default** (`DEFAULT_ROUTES.backchannelLogout = false`, `config.ts:190`) — see §11.1 for why: first-party revocation is pull, not push, so the route would sit there accepting nothing; it stays available (`routes: { backchannelLogout: '/backchannel-logout' }`) for the third-party `RelyingParty` path only. |
| `GET /auth/session` | The current principal, or 401. |
| `GET /auth/step-up` | Claims an elevation grant, prompting identity only when there is nothing to claim. |
| `GET /auth/organisations`, `POST /auth/organisation` | Lists the organisations this session may act in, and switches the active one (rotating the session cookie). |

Override any path or turn a route off with `routes: { basePath: '/session', stepUp: false }`.

**The browser routes are gated by `AUTH_BROWSER_LOGIN` (default `true`) AND having client credentials
configured** (`resolveBrowserAuthConfig`, `config.ts:228`: `enabled = (options.enabled ??
Config.get('auth.browser-login')) && Boolean(client.client)`) — not by any redirect-URI condition. An
API-only service with no client credential gets no browser routes automatically; one with credentials
gets them unless explicitly turned off.

## 6. Guards and the principal

```ts
@Get()
@Authenticated()              // bearer token OR session cookie — handlers never branch on which
list() { return this.context.getAuthPrincipal(); }

@Post()
@RequireScope('reports:write')
create() {}

@Delete('/:id')
@RequirePermission('reports:delete')   // PDP decision, fails closed
remove() {}
```

- Protection is **opt-in**: routes without auth metadata are not guarded. There is no `@Public()` in the
  SDK; an app wanting default-deny builds that in its own auth module.
- `getAuthPrincipal()` throws 401 when the guard did not run; `getAuthPrincipalOrNull()` does not.
- Service (`kind: 'service'`) principals are deny-by-default and need a matching service-access rule.
- Failures collapse to generic `IAM_001` (401) / `IAM_002` (403). The one exception is `IAM_003`
  (step-up required), which is deliberately actionable.
- Access-token claims (identity, verified): `iss`, `sub`, `aud` (**plain string, never an array**),
  `client_id`, `scope` (space-delimited, may be empty), `token_type` (**`user`|`service`** — not
  `Bearer`), `iat`, `exp`, `jti`; conditionally `org`, `sid`, and `aal` (**uppercase `AAL1`/`AAL2`**, and
  **only** on app-session mints — `/oauth2/token` never sets it). There is no `acr`/`amr`/`nbf`.

## 7. Step-up (AAL2)

```ts
@Post('/transfer')
@RequireElevation()     // principal.aal === 'AAL2', guaranteed
transfer() {}
```

The SDK drives claim → prompt → retry for browsers and answers `IAM_003` to everyone else. The elevated
token is minted only for the routes that require it, cached under a separate key, and dies with its grant.
A user working across two apps steps up in each — that is the isolation, not a bug.

**Identity's discovery document advertises `step_up_endpoint`, and the SDK reads it — no manual URL
config needed.** Identity returns `step_up_endpoint: ${issuer}/step-up` (`oauth.controller.ts:87`);
`AuthClient.getStepUpEndpoint()` (`auth-client.ts:493`) uses that value directly, falling back to
`${issuer}/auth/step-up` only if discovery omits it (a warning-logged degraded path that identity's own
discovery never actually triggers). `BrowserAuthOptions.stepUpUrl` is still available as an override for
a non-standard deployment, but it is not required — the doc comment on the option itself says so
verbatim: "Overrides discovery's `step_up_endpoint`; the endpoint is derived, not configured"
(`config.ts:76`).

The grant is consumed on claim: identity clears the central `elevated_until` while leaving `aal = AAL2`.

## 8. Service-to-service

```ts
await auth.fetchService('novel-forge', '/api/v1/books', {}, { resource: 'api://novel-forge' });
```

Uses the `svc://` scheme (never hard-code hostnames), attaches a cached service token, retries once on a
stale-token 401. `getServiceToken()` caches per `(resource, scopes)` with singleflight until 60 s before
expiry.

The M2M token used for identity's own APIs must have `aud = shadow-identity` — mint it with no `resource`
override, which is what the SDK does internally.

## 9. Role catalog and service access

- `roles` passed to `forRoot` is pushed on startup and is a **destructive full replace** scoped to the
  application derived from the token — it must be the complete set, not a delta.
- Service-access rules load at startup; until they do, every M2M caller is denied.

## 10. Testing

Use `createTestIdP` / `createTestSigner` from `@shadow-library/auth/testing` — never hand-roll token
fixtures. The mock covers discovery, JWKS, token, PDP, catalog, service access **and** the app-session
routes, and it enforces `app-session:manage`, so the "a handle alone grants nothing" property is actually
exercised. Drivers: `setSteppedUp`, `endIdentitySession`, `issueLogoutToken`, `getAppSessionCount`,
`getLastMintRequest`, `setEndpointFailure`.

Integration specs boot a real graph (`ShadowFactory.create`) and drive the router via
`app.get(Dispatcher).mockRequest()`.

## 11. Landmines (verified against identity/auth source)

1. **Back-channel logout does not reach app-session clients.** Identity derives its recipient set from
   `refresh_token_families` bound to the session, and the app-session flow never creates one. Revocation is
   therefore **pull, not push**: every mint re-validates the central session and fails `AUTH_005`. Do not
   design anything that depends on the notice arriving. (`architecture.md`'s BCL sequence is wrong here.)
2. **Minting never errors on scope narrowing.** Identity filters the requested scope against consent, the
   client's grants for that audience, and — for `is_sensitive` scopes — a live elevation, then returns
   **200 with whatever survived**. A caller that ignores the returned `scope` will hand its API a token
   missing the capability it asked for.
3. **`resource` must be set at authorize time, not just at mint.** The app session's granted scope is frozen
   from the authorization code. Minting later for a resource that was not requested at login yields an empty
   or truncated scope with a 200. This effectively binds one app session to one target API.
4. **Omitting `resource` on a mint silently produces `aud: "shadow-identity"`** — a token your own API must
   reject.
5. **Rate limiting is per source IP, 100 req/min, and applies to the mint endpoint.** A whole fleet behind one
   egress IP shares that budget; the SDK's token cache is what keeps you under it. Breach → `RATE_LIMITED`,
   429. Use `RATE_LIMIT_IP_ALLOWLIST` on identity for internal callers.
6. **`aud` is a plain string, never an array.**
7. **A handle presented by the wrong client reads as `AUTH_005` 401**, not 403 — deliberate
   indistinguishability. Treat 401 as "restart the login", never "retry with another credential".
8. **PDP has no batch endpoint.** `checkAll` fans out N single calls. Principal type on the wire is
   `USER | SERVICE_ACCOUNT`, which does **not** match the token's `token_type` (`user`/`service`).
9. **`GET /oauth2/userinfo` checks only signature, `sub` and `exp`** — not `aud`, `token_type`, or scope.
   Never use it as an authorization signal.
10. **`scopes_supported` in discovery is the platform-wide union** across every application, so startup scope
    validation catches typos, not entitlement.
11. **There is no `end_session_endpoint` and no `/oauth2/logout`.** RP-initiated logout is not available;
    logout ends the app session only.
12. **OAuth error codes travel as RFC 6749 strings**, not identity's internal keys: `invalid_target`,
    `invalid_scope`, `invalid_grant`, `invalid_client`. `AUTH_005`/`AUTH_006` do appear verbatim.
13. **Token requests are form-encoded.** Identity still accepts JSON but logs it as deprecated; the SDK sends
    form-encoded already.
14. **The login-state cookie is deliberately unsealed, with no server-side store.** `login-state.ts`'s own
    block comment: it travels as a plain `__Host-`-prefixed, `HttpOnly`, `Secure`, `SameSite=Lax` cookie —
    "no sealing key, no server-side store, and therefore no shared secret to distribute and no
    single-instance caveat." That's a deliberate downgrade from an earlier sealed-cookie design, and it
    holds because login-CSRF is defeated by the `__Host-` prefix (not encryption), a leaked PKCE verifier
    is inert without the app's own M2M credential, and `state` is compared in constant time
    (`matchesState`, `timingSafeEqual`). There is nothing here that needs `AUTH_SESSION_SECRET` — that
    env var doesn't exist (see §4). If you see the old sealed/store-backed design (`LoginStateStore`,
    `InMemoryLoginStateStore`, `SealedLoginStateStore`, or a caveat about needing a shared secret in a
    multi-replica deploy) referenced anywhere, that's stale.
15. **Stale identity docs — do not propagate:** `service-integration-guide.md` (seeded novel-forge/web-novel
    clients as a `<app>`/`<app>-server` pair — see §3 for the current one-client model; UUID client ids,
    `ECOSYSTEM_*` env vars, lowercase `aal1`/`aal2`, `checkAll` batch PDP — note its `app-session:manage`
    grant description at line 73 is otherwise consistent with current source); `auth/api-contract.md`
    (`POST /auth/step-up`); `architecture.md` (`acr`/`amr` on access tokens, `GET /oauth2/logout`, batch
    PDP, BCL destroying app sessions). `packages/auth/docs/sdk.md` is **not** stale on this point — it
    correctly documents the SDK's history: "this repository — originally developed inside
    `identity-server` as the workspace package `packages/auth`, since extracted so consumers version the
    SDK independently" (`sdk.md:8`).
