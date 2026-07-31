# Auth reference — integrating a Shadow app with Shadow Identity

Load this whenever a task touches login, route protection, service-to-service calls, permissions, or
step-up. Facts here are verified against `apps/identity-server` source, not its docs — several identity
docs are stale and are called out in §11.

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

The SDK cannot work until an admin registers the app in identity. `POST /api/v1/admin/clients` (needs
`iam:clients:manage` + AAL2). Two clients are normally needed:

| Client | `kind` | Purpose |
| --- | --- | --- |
| `<app>` | `WEB_CONFIDENTIAL` | The browser login client. Needs `isFirstParty: true`, `redirectUris`, grant types `authorization_code` (+ `refresh_token` only if a third-party surface also exists). |
| `<app>-server` | `SERVICE` | The M2M identity of the backend. `client_credentials`. This is the one the SDK authenticates with. |

A single confidential client can play both roles if it holds both grants — that is what `AUTH_CLIENT_ID`
points at.

Also required, all admin operations:

- `clientId` is an **admin-chosen slug** (`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`), not a generated UUID.
- An **API resource** whose `identifier` is this service's audience (e.g. `api://reports`). That string is
  `AUTH_AUDIENCE` and the `aud` the service accepts.
- **Scopes** created on that resource, and **granted to the client** (`POST /api/v1/admin/clients/:id/scopes`).
  Mark a scope `is_sensitive` when it must only ever be mintable into an elevated token.
- The scope **`app-session:manage` granted to the service client** — without it every mint fails. No seeded
  client has it; it is always an explicit grant.
- `authz:check` (PDP + service-access rules) and `authz:roles:sync` (role-catalog push) if used. Method-level
  scope **replaces** class-level on identity's side, so the catalog push needs `authz:roles:sync` *only*.
- `redirect_uris` are matched **exactly** — absolute, no fragment.
- Service-access rules (`/api/v1/admin/service-access`) for every M2M caller allowed to reach this service.
  Deny-by-default; granting a caller needs an admin change **plus a restart** of the target service.

In-cluster the preferred credential is **workload identity**: register `workloadSubjects`
(`system:serviceaccount:<ns>:<name>`) and set `AUTH_CLIENT_ASSERTION_PATH` to the projected SA token. No
long-lived secret then exists on either side. `client_secret_basic` is for workloads outside the cluster.

## 4. Configuration

| Env | Meaning |
| --- | --- |
| `AUTH_ISSUER` | Identity base URL. MUST match identity's `OAUTH_ISSUER` **exactly** — a trailing-slash mismatch is a blanket 401. |
| `AUTH_AUDIENCE` | This service's API resource identifier; the `aud` it accepts and mints for. |
| `AUTH_CLIENT_ID` | Service-account client slug. |
| `AUTH_CLIENT_ASSERTION_PATH` | Projected k8s SA token — preferred in-cluster. |
| `AUTH_CLIENT_SECRET` | Static secret — outside the cluster only. |
| `AUTH_REDIRECT_URI` | Registered callback. **Setting this is what turns the browser flow on.** |
| `AUTH_SCOPES` | Space-separated scopes requested at login. |
| `AUTH_SESSION_SECRET` | Seals the transient login-state cookie. Without it the store is in-memory — correct, but single-instance only. Set it in any multi-replica deploy. |
| `AUTH_ALLOWED_REDIRECTS` | Comma-separated `return_to` allow-list. Same-origin paths are always allowed. |
| `AUTH_POST_LOGIN_REDIRECT` | Default landing path (`/`). |
| `AUTH_STEP_UP_URL` | The identity **UI** page that performs a step-up. See §7 — there is no standard endpoint, so this must be set for elevation to work. |
| `AUTH_SESSION_COOKIE_NAME` | Defaults to `__Host-shadow-session`. |
| `AUTH_SESSION_COOKIE_SECURE` | Escape hatch for plain-HTTP dev only; drops the `__Host-` prefix and warns. |
| `AUTH_TIMEOUT` | Total ms budget per outbound request. |

Anything settable by env is overridable in code via `AuthModule.forRoot({ browser: { … }, routes: { … } })`
— code wins. Some apps lean on this: `pulse-server` and `novel-forge-server` each declare their **own**
app-owned env var (`AUTH_APP_ID` — not an SDK-recognized name, just the app's own `bootstrap.ts` `Config.load`
key) holding their identity client slug, then resolve audience/redirect/scopes from
`GET {AUTH_ISSUER}/api/v1/apps/me` at boot and pass the result into `AuthModule.forRoot()` explicitly —
so their steady-state deploy only sets `AUTH_ISSUER` + `AUTH_APP_ID` + a credential, none of the other
rows in the table above. See their own `CLAUDE.md` before assuming the table above is what a given app
actually reads — this is a per-app choice, not a second SDK config surface. Config MUST be read through
`Config` — never `process.env`.

## 5. What gets registered

| Route | Behaviour |
| --- | --- |
| `GET /auth/login` | PKCE + `state` + `nonce` + `resource`; transient state sealed into its own cookie; redirect to identity. |
| `GET /auth/callback` | Validates `state`, redeems the code for a handle, sets the session cookie, returns to `return_to`. |
| `POST /auth/logout` | Revokes the app session and clears the cookies. |
| `POST /auth/backchannel-logout` | Verifies an OIDC logout token and drops matching local sessions. **See §11 — this does not fire for app-session clients.** |
| `GET /auth/session` | The current principal, or 401. |
| `GET /auth/step-up` | Claims an elevation grant, prompting identity only when there is nothing to claim. |

Override paths or disable any route with `routes: { basePath: '/session', backchannelLogout: false }`.
`AuthModule.forRoot()` now also wires organisation-switch routes/DTOs when the app has multi-org
principals — see `references/api-catalog.md` → `@shadow-library/auth` → `./module` for the current
`AuthOrganisationItem`/`SwitchOrganisationBody` symbols; this file doesn't enumerate every field since
the exact route paths are per-app configurable like the rest of this table.

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

**There is no step-up endpoint on identity that an app can redirect to.** Identity performs step-up on its
own domain via session-cookie-authenticated API calls made by the identity UI (`POST /api/v1/me/mfa/step-up`,
`.../webauthn/step-up`). So `AUTH_STEP_UP_URL` MUST be set to whatever identity-domain **page** hosts that
flow, with the SDK appending `return_to`. Do not assume a default works.

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

## 11. Landmines (verified against identity source)

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
14. **The login-state cookie is now stateless.** `@shadow-library/auth/module`'s old `LoginStateStore`/
    `InMemoryLoginStateStore`/`SealedLoginStateStore` abstraction is gone — login state is sealed directly
    into the transient cookie via `encodeLoginState`/`decodeLoginState` (`AUTH_SESSION_SECRET` still seals
    it; still single-instance-only without it). If you see the old store classes referenced anywhere,
    that's stale.
15. **Stale identity docs — do not propagate:** `service-integration-guide.md` (seeded novel-forge/webnovel
    clients, UUID client ids, `ECOSYSTEM_*` env vars, lowercase `aal1`/`aal2`, `checkAll` batch PDP);
    `auth/api-contract.md` (`POST /auth/step-up`); `architecture.md` (`acr`/`amr` on access tokens,
    `GET /oauth2/logout`, batch PDP, BCL destroying app sessions); `sdk.md` (claims the SDK is a workspace
    package of identity-server — it's `packages/auth`, a sibling workspace in this same monorepo, but its
    own independent package with its own `.shadowrc.json`, not physically inside identity-server).
