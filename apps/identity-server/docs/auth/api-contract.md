# Shadow Identity — Interactive Auth API Contract

|                  |                                                                                                                                                                                                                                           |
| :--------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**       | Approved for development                                                                                                                                                                                                                  |
| **Version**      | 2.0.0                                                                                                                                                                                                                                     |
| **Last updated** | 2026-07-11                                                                                                                                                                                                                                |
| **Base URL**     | `https://identity.shadow-apps.com/api/v1`                                                                                                                                                                                                 |
| **Supersedes**   | v1. Token-cookie delivery (`AT`/`RT` cookies) and `POST /auth/session/refresh` are **withdrawn** — the browser holds only the `__Host-sid` session cookie (decision D-10); applications use `/oauth2/*` (see `docs/architecture.md` §12). |

## 0. Core concepts

### Cookies

Successful authentication sets exactly two cookies (never tokens in the JSON body or URLs):

1. `__Host-sid` — opaque session ID. `Secure; HttpOnly; SameSite=Lax; Path=/`.
2. `isLoggedIn=true` — UI hint. `Secure; SameSite=Lax`, not HttpOnly.

All state-changing endpoints require the CSRF double-submit header (`x-csrf-token`) per `HttpCoreModule`.

### State machine contract

- Every response carries `flowId` and `status` (the current state). Clients render based on `status`, never on assumed sequence.
- Calling an endpoint that does not match the current state → `409 Conflict` (`FLOW_INVALID_STATE`).
- Flows cannot go backwards; call `POST /auth/cancel` and restart to change earlier inputs.
- Expired/terminated flows → `410 Gone` (`FLOW_EXPIRED` / `FLOW_TERMINATED`).
- Errors are machine codes only (`docs/standards.md`); `attemptsLeft` / `resendsLeft` / `retryAfterSeconds` accompany limit-related responses.

### Neutrality (decision D-12)

`register/init`, `login/init`, and `recover/init` return the **same shape and status codes** whether or not the identifier maps to an account. No endpoint in this contract confirms account existence.

## 1. Registration

### 1.1 `POST /auth/register/init`

```jsonc
// request
{ "email": "jane.doe@example.com", "deviceId": "uuid-v7" }
// 200 — always, per D-12
{ "flowId": "flow_auth_…", "status": "AWAITING_EMAIL_OTP", "resendsLeft": 3, "metadata": { "maskedEmail": "j***@example.com" } }
```

### 1.2 `POST /auth/challenge/verify` (email OTP)

```jsonc
// request
{ "flowId": "flow_auth_…", "code": "123456" }
// 200
{ "flowId": "flow_auth_…", "status": "AWAITING_DEMOGRAPHICS" }
// 401 — { "code": "INVALID_CODE", "attemptsLeft": 2 }
```

### 1.3 `POST /auth/register/demographics`

```jsonc
{ "flowId": "flow_auth_…", "dateOfBirth": "1995-08-15", "gender": "FEMALE" }
// 200 → { "status": "AWAITING_PROFILE" }
```

### 1.4 `POST /auth/register/profile`

```jsonc
{ "flowId": "flow_auth_…", "firstName": "Jane", "lastName": "Doe" }
// 200 → { "status": "AWAITING_PASSWORD_SET" }
```

### 1.5 `POST /auth/register/password` — completes registration

```jsonc
{ "flowId": "flow_auth_…", "password": "…" }
// 200 → { "status": "COMPLETED" }  + Set-Cookie: __Host-sid, isLoggedIn
// 422 — { "code": "PASSWORD_POLICY", "reasons": ["TOO_SHORT" | "BREACHED" | …] }
```

## 2. Login

### 2.1 `POST /auth/login/init`

```jsonc
{ "identifier": "jane.doe@example.com", "deviceId": "uuid-v7" }
// 200 — identical shape for unknown identifiers
{ "flowId": "flow_auth_…", "status": "AWAITING_PASSWORD", "hasAlternativeMethods": true }
```

### 2.2 `GET /auth/challenge/methods?flowId=…`

The list derives from the _shape of the typed identifier_ plus universally available methods —
never from the resolved account (D-12): `PASSWORD` and `WEBAUTHN` always; `EMAIL_OTP` when the
identifier is an email; `SMS_OTP` when it is a phone number. Known and unknown identifiers
therefore produce identical lists, and account-specific channels are not discoverable
pre-authentication.

```jsonc
// 200
{ "flowId": "…", "methods": [{ "name": "PASSWORD" }, { "name": "WEBAUTHN" }, { "name": "EMAIL_OTP", "metadata": { "maskedEmail": "j***@example.com" } }] }
```

### 2.3 `POST /auth/challenge/change`

Switches the flow's first factor; not permitted once an MFA step is pending. OTP methods issue
their first code here (masked target derived from the identifier). An OTP first factor still
walks MFA-enrolled accounts through their second factor and completes at AAL1 otherwise.

```jsonc
{ "flowId": "…", "method": "EMAIL_OTP" }
// 200 → { "flowId": "…", "status": "AWAITING_EMAIL_OTP", "resendsLeft": 3, "metadata": { "maskedEmail": "j***@example.com" } }
```

### 2.4 `POST /auth/challenge/resend`

Budget: 3 resends per flow, 60 s cooldown between sends, 5 deliveries per identifier per hour
across flows (the identifier cap suppresses delivery silently — the response still reads `SENT`).

```jsonc
{ "flowId": "…", "method": "EMAIL_OTP" }
// 200 → { "status": "SENT", "resendsLeft": 2, "retryAfterSeconds": 60 }
// 429 → { "status": "LIMITED", "retryAfterSeconds": 41 }   + Retry-After header
```

### 2.5 `POST /auth/challenge/verify`

```jsonc
// password submission
{ "flowId": "…", "password": "…" }
// OTP submission
{ "flowId": "…", "code": "123456" }
// WebAuthn submission
{ "flowId": "…", "assertion": { /* WebAuthn assertion */ } }

// 200 — complete:            { "status": "COMPLETED" } + Set-Cookie
// 200 — MFA required:        { "status": "AWAITING_TOTP", "attemptsLeft": 3 }
// 401 — invalid:             { "code": "INVALID_CREDENTIALS", "attemptsLeft": 2 }
// 401 — admin-forced reset:  { "status": "PASSWORD_RESET_REQUIRED" } — the password was correct
//        but an administrator forced a reset; recover via §3. Does not burn failure budget.
// 410 — flow terminated:     { "code": "FLOW_TERMINATED" }
```

### 2.6 OIDC handoff

When a flow was started by a redirect from `/oauth2/authorize`, `COMPLETED` responses additionally include `{ "resumeUrl": "/oauth2/authorize?resume=…" }`; the client navigates there to receive the authorization code on the registered redirect URI.

## 3. Recovery

### 3.1 `POST /auth/recover/init`

```jsonc
{ "identifier": "jane.doe@example.com", "deviceId": "uuid-v7" }
// 200 — always
{ "flowId": "…", "status": "AWAITING_EMAIL_OTP", "resendsLeft": 3, "metadata": { "maskedEmail": "j***@example.com" } }
```

### 3.2 `POST /auth/challenge/verify` — as §2.5. MFA-enrolled accounts then receive `{ "status": "AWAITING_TOTP" }` (or another enrolled factor) before the password step.

### 3.3 `POST /auth/recover/reset`

```jsonc
{ "flowId": "…", "newPassword": "…" }
// 200 → { "status": "COMPLETED" } + Set-Cookie (fresh session; all other sessions revoked)
// 422 — { "code": "PASSWORD_POLICY", "reasons": ["HISTORY_MATCH", …] }
```

## 4. Session and flow auxiliaries

### 4.1 `POST /auth/cancel`

`{ "flowId": "…" }` → `204`. Deletes the flow.

### 4.2 `POST /auth/signout`

Requires session + CSRF. `204`; clears the session cookies and revokes the **current** session and
its refresh-token families. Revoking every other session is `DELETE /me/sessions` (§4.4).
Clients registered with a `backchannel_logout_uri` receive an OIDC back-channel logout token (§6).

### 4.3 `POST /auth/step-up`

Re-authentication for sensitive operations: starts a `STEP_UP` flow bound to the current session; on completion sets `elevated_until = now() + 10m`. Same challenge endpoints as login.

### 4.4 Session management (under `/me`, session cookie + CSRF) — _implemented (M6)_

- `GET /me/sessions` → `{ sessions: [{ id, aal, createdAt, lastUsedAt, ipAddress?, ipCountry?, userAgent?, deviceName?, isCurrent }] }`.
- `DELETE /me/sessions/{sessionId}` → `{ revoked: 1 }` — revoke one (step-up required); cascades to the session's refresh-token families and queues back-channel logout. A foreign or unknown session id answers `404` identically.
- `DELETE /me/sessions` → `{ revoked: n }` — revoke all except current (step-up required).

### 4.5 MFA management (under `/me/mfa`, session cookie + CSRF) — _implemented (M4)_

- `GET /me/mfa` — list verified enrollments (TOTP + passkeys).
- `POST /me/mfa/totp/enroll` → `{ secret, uri }` (base32 seed + otpauth URI, shown once). Adding the _first_ factor needs only a session; changing factors once MFA exists requires elevation.
- `POST /me/mfa/totp/activate` `{ code }` → `{ success, recoveryCodes? }` — proof-of-possession activates the enrollment; the account's first factor also returns its one-time recovery-code batch.
- `DELETE /me/mfa/totp` — step-up required.
- `POST /me/mfa/step-up` `{ code }` → `{ aal, elevatedUntil }` — elevates the current session to AAL2 via TOTP.
- `POST /me/mfa/recovery-codes` → `{ recoveryCodes }` — regenerates (step-up required); previous batch is retired atomically.

### 4.6 WebAuthn (passkeys) — _implemented (M4)_

- `POST /me/webauthn/register/options` / `POST /me/webauthn/register/verify` `{ …attestation, label? }` — registration ceremony; challenges live server-side (Redis, 5 min, single use). First factor returns recovery codes.
- `DELETE /me/webauthn/{credentialId}` — step-up required.
- `POST /auth/webauthn/options` `{ flowId? }` → `{ flowId, options }` — assertion options; without `flowId` begins a usernameless (discoverable) login, with one serves the flow's MFA step. Neutral either way (D-12).
- `POST /auth/challenge/verify` `{ flowId, webauthn: <assertion> }` — completes the passkey step; also accepts `{ code }` (TOTP at `AWAITING_TOTP`) and `{ recoveryCode }` at any MFA step. Sessions completing MFA (or a user-verified passkey first factor) record `AAL2`.

### 4.7 Identity summary — _implemented (M6)_

`GET /me` (session cookie) → `{ userId, firstName?, lastName?, email?, aal, elevated, elevatedUntil? }` — profile basics plus session assurance for first-party surfaces (the account page renders step-up affordances from `elevated`).

### 4.8 Consent interaction (session cookie + CSRF) — _implemented (M6)_

The hosted consent screen's backing endpoints; the UI trusts nothing from the URL beyond the same-origin authorize link.

- `GET /auth/consent?clientId=&scope=` → `{ clientName, isFirstParty, alreadyGranted, scopes: [{ name, description?, isSensitive }] }`. Standard OIDC scopes (`openid`, `profile`, `email`, `offline_access`) are described from a fixed map; resource scopes from their registrations. Unknown/inactive clients → `400`.
- `POST /auth/consent` `{ clientId, scopeNames, decision: APPROVE|DENY, redirectUri?, state? }` → `{ decision, redirectTo? }`. APPROVE records a `USER`-sourced consent (audited); DENY answers with an `error=access_denied` redirect **only** when `redirectUri` matches the client's registration — the browser never builds one from untrusted input.

### 4.9 Emails & phones (under `/me`, session cookie + CSRF) — _implemented (M4)_

- `GET /me/emails` · `GET /me/phones` — list with `isPrimary` / `verifiedAt`.
- `POST /me/emails` `{ email }` → `{ verificationId }`; `POST /me/emails/verify` `{ verificationId, code }`. Same pair for `/me/phones` (SMS OTP). Neutral when the address is verified elsewhere (D-12).
- `POST /me/emails/primary` · `POST /me/phones/primary` — verified identifiers only.
- `DELETE /me/emails` · `DELETE /me/phones` (body carries the identifier) — the primary cannot be removed. Unverified claims expire after 7 days (worker).

## 5. OAuth 2.1 / OIDC endpoints

Specified in `docs/architecture.md` §12; not duplicated here. The interactive flows above are reachable from `/oauth2/authorize` when no valid session exists, via `oidcResume` (§2.6).

### 5.1 Back-channel logout — _implemented (M6)_

Clients registered with a `backchannel_logout_uri` receive an [OIDC Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html) token whenever a session that issued them a refresh-token family terminates (signout, self-service revocation, admin termination, lock, erasure). The logout token is an EdDSA JWT (`iss`, `sub`, `aud` = client id, `iat`, `exp` +120 s, `jti`, `events`, `sid`; never `nonce`), POSTed as `logout_token=<jwt>` (`application/x-www-form-urlencoded`). Delivery is transactional with retries/backoff and dead-letters after 5 attempts; the worker process is the sender. ID tokens carry `sid` so clients can correlate. Discovery advertises `backchannel_logout_supported` and `backchannel_logout_session_supported`.

## 6. Administrative APIs (`/api/v1/admin/*`) — _implemented (M6)_

Session cookie + CSRF; every endpoint is PDP-guarded in the platform organisation (T-601): reads need the matching `iam:*:read`/manage permission at AAL1+, mutations demand an AAL2 step-up. All mutations are actor-attributed in the audit chain.

### 6.1 Users (`/admin/users`) — requires `iam:users:read` / `iam:users:manage`

- `GET /admin/users?email=&status=&page=&limit=` — paginated search (email substring matches any address).
- `GET /admin/users/{id}` — detail: identifiers, MFA summary, lock state, active-session count. Never credential material.
- `POST /admin/users/{id}/lock` `{ mode: OTP_ONLY|FULL, until? }` — `FULL` also revokes sessions + refresh tokens. `POST …/unlock` clears (including Tier-4 locks).
- `POST /admin/users/{id}/force-password-reset` — flags the account (§2.5) and revokes everything issued.
- `POST /admin/users/{id}/sessions/terminate` · `POST …/deactivate` · `POST …/reactivate`.
- `DELETE /admin/users/{id}` — right-to-erasure: scrubs PII/credentials, closes the account, keeps the audit skeleton.
- `GET /admin/users/{id}/audit` — recent audit trail (requires `iam:audit:read`).

### 6.2 Clients & resources (`/admin/clients`, `/admin/resources`) — requires `iam:clients:read` / `iam:clients:manage`

- `POST /admin/clients` — register (kind, grant types, redirect URIs, `backchannelLogoutUri?`); confidential clients get their secret exactly once.
- `GET /admin/clients` · `GET /admin/clients/{id}` · `PATCH /admin/clients/{id}` (name, `isActive`, redirect-URI set replacement, logout URI).
- `POST /admin/clients/{id}/rotate-secret` — dual-secret rotation; previous secrets expire after a 24 h overlap.
- `POST /admin/clients/{id}/scopes` `{ scopeId }` · `DELETE /admin/clients/{id}/scopes/{scopeId}`.
- `GET/POST /admin/resources` · `POST /admin/resources/{id}/scopes` — API resources and their scopes.

### 6.3 Roles & assignments (`/admin/roles`, `/admin/permissions`, `/admin/role-assignments`)

Two-tier authorization (T-601): `iam:roles:manage` platform-wide, or `app:roles:manage` scoped to the owning application. A role can only carry permissions defined by its own application.

- `POST /admin/roles` `{ applicationId, roleName, description? }` · `POST /admin/permissions` `{ applicationId, name, description? }` · `GET /admin/permissions?applicationId=`.
- `POST /admin/roles/{roleId}/permissions` `{ permissionId }` · `DELETE /admin/roles/{roleId}/permissions/{permissionId}`.
- `POST /admin/role-assignments` and `POST /admin/role-assignments/revoke` `{ principalType, principalId, roleId, organisationId }` · `GET /admin/role-assignments?…` (platform tier only).
