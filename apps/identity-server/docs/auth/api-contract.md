# Shadow Identity — Interactive Auth API Contract

|                  |                                                                                                                                                                                                                                           |
| :--------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**       | Approved for development                                                                                                                                                                                                                  |
| **Version**      | 2.0.0                                                                                                                                                                                                                                     |
| **Last updated** | 2026-07-12                                                                                                                                                                                                                                |
| **Base URL**     | `https://identity.shadow-apps.com/api/v1`                                                                                                                                                                                                 |
| **Supersedes**   | v1. Token-cookie delivery (`AT`/`RT` cookies) and `POST /auth/session/refresh` are **withdrawn** — the browser holds only the `__Host-sid` session cookie (decision D-10); applications use `/oauth2/*` (see `docs/architecture.md` §12). |

## 0. Core concepts

### Cookies

Successful authentication sets exactly two cookies (never tokens in the JSON body or URLs):

1. `__Host-sid` — opaque session ID. `Secure; HttpOnly; SameSite=Lax; Path=/`.
2. `isLoggedIn=true` — UI hint. `Secure; SameSite=Lax`, not HttpOnly.

All state-changing endpoints require the CSRF double-submit header (`x-csrf-token`) per `HttpCoreModule`.

### Machine-readable spec

Outside production, `HttpCoreModule` serves the full OpenAPI 3.1 document at `GET /dev/api-docs/openapi.json` (derived from the class-schema DTOs — it is generated, never hand-maintained). First-party clients generate their request/response types from it rather than transcribing this contract by hand; this document remains the prose source of truth for behaviour, neutrality, and state transitions that the schema alone cannot express.

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

- `GET /me/mfa` → `{ enrollments: [{ type, label, credentialId?, createdAt, lastUsedAt? }], recoveryCodesRemaining }` — verified enrollments (TOTP + passkeys) plus how many one-time recovery codes are still unused (the security page warns when the balance runs low).
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

`PATCH /me/profile` `{ firstName?, lastName? }` → the refreshed `GET /me` shape — updates the display name shown across first-party surfaces. `firstName`, when present, must be non-empty; email and phone are managed under §4.9, not here.

### 4.8 Consent interaction (session cookie + CSRF) — _implemented (M6)_

The hosted consent screen's backing endpoints; the UI trusts nothing from the URL beyond the same-origin authorize link.

- `GET /auth/consent?clientId=&scope=` → `{ clientName, isFirstParty, alreadyGranted, scopes: [{ name, description?, isSensitive }] }`. Standard OIDC scopes (`openid`, `profile`, `email`, `offline_access`) are described from a fixed map; resource scopes from their registrations. Unknown/inactive clients → `400`.
- `POST /auth/consent` `{ clientId, scopeNames, decision: APPROVE|DENY, redirectUri?, state? }` → `{ decision, redirectTo? }`. APPROVE records a `USER`-sourced consent (audited); DENY answers with an `error=access_denied` redirect **only** when `redirectUri` matches the client's registration — the browser never builds one from untrusted input.

The standing grants those approvals create are reviewed and revoked from the account portal:

- `GET /me/consents` → `{ items: [{ clientId, clientName, scopeNames, source: USER|FIRST_PARTY_POLICY|ADMIN, grantedAt }] }` — every client that still holds a grant, backing the "Connected apps" page.
- `DELETE /me/consents/{clientId}` → `{ success }` — withdraws the grant (audited `oauth.consent.withdrawn`); the client must prompt for consent again the next time it needs those scopes.

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

Two-tier authorization (T-601): `iam:roles:manage` platform-wide, or `app:roles:manage` scoped to the owning application.

Role and permission **definitions** are no longer created here — each application owns its catalog in code and pushes it via the SDK (`PUT /api/v1/authz/catalog`, scope `authz:roles:sync`, full declarative sync; see architecture.md D-15 and sdk.md). The admin surface keeps only the read view and **assignment**:

- `GET /admin/permissions?applicationId=` — read the catalog.
- `POST /admin/role-assignments` and `POST /admin/role-assignments/revoke` `{ principalType, principalId, roleId, organisationId }` · `GET /admin/role-assignments?…` (platform tier only).

### 6.4 Webhooks (`/admin/webhooks`) — requires `iam:webhooks:manage` — _implemented (M7)_

Platform-tier only (org-scoped subscriptions are a deliberate non-goal for now). Subscriptions receive matching audit events; payloads carry identifiers and event metadata only — never the audit `detail`, addresses, or secrets.

- `POST /admin/webhooks` `{ name, targetUrl, eventTypes[] }` — filters are exact audit actions, `prefix.*`, or `*`; the target must be a public https URL (SSRF-guarded at registration and again at delivery after DNS resolution). Signing secret (`whsec_…`) returned exactly once.
- `GET /admin/webhooks` · `GET /admin/webhooks/{id}` · `PATCH /admin/webhooks/{id}` (name, target, filters, `isActive`) · `DELETE /admin/webhooks/{id}`.
- `POST /admin/webhooks/{id}/rotate-secret` — new secret returned once; the outgoing secret keeps signing alongside it for a 24 h overlap.
- `GET /admin/webhooks/{id}/deliveries?status=` — delivery log (status, attempts, last error, response code).
- `POST /admin/webhooks/{id}/deliveries/{deliveryId}/redeliver` — puts a settled/dead delivery back into the pool afresh.

Delivery contract: `POST` JSON with headers `x-shadow-webhook-id` (delivery id — receivers deduplicate on it), `x-shadow-webhook-event`, and `x-shadow-webhook-signature: t=<unix>,v1=<hex>[,v1=<hex>]` where each `v1` is HMAC-SHA256 over `<t>.<raw body>` with a currently valid secret. Receivers should reject timestamps older than 5 minutes. Retries back off exponentially and dead-letter after 5 attempts.

## 7. Organisations (`/api/v1/organisations`, `/api/v1/me/organisations`) — _implemented (M7)_

Session cookie + CSRF. Org-level roles (`OWNER > ADMIN > MEMBER`) govern organisation administration only; product permissions stay on the PDP. Absent and foreign organisations answer identically (`ORG_001`, 403). Personal workspaces reject every membership operation (`ORG_003`). Routine administration needs ADMIN at AAL1; owner changes, deletion, and domain operations demand OWNER (or ADMIN for domains) at AAL2.

### 7.1 Lifecycle & membership

- `POST /organisations` `{ name, slug? }` — creates a TEAM org owned by the caller; slug is validated or generated (201). Duplicate slug → 409 `ORG_006`.
- `GET /organisations/{id}` · `PATCH /organisations/{id}` `{ name }` (ADMIN) · `DELETE /organisations/{id}` (OWNER, AAL2) — soft delete; every org-scoped role assignment is revoked.
- `GET /organisations/{id}/members` — members with role and primary email.
- `PATCH /organisations/{id}/members/{userId}` `{ role }` — callers administer only ranks strictly below their own; any change touching OWNER requires an elevated owner. Last-owner demotion → 409 `ORG_004`.
- `DELETE /organisations/{id}/members/{userId}` — same rank rules; revokes the member's org-scoped grants and notifies them.

### 7.2 Invitations

- `POST /organisations/{id}/invitations` `{ email, role: ADMIN|MEMBER }` (ADMIN) — issues a single-use, 7-day, email-bound token delivered via the notification outbox; re-inviting supersedes the pending invitation. The response never reveals whether the address has an account (D-12). Budget: 20/org/hour → 429. Owners are never invited directly — ownership is granted after joining.
- `GET /organisations/{id}/invitations` (ADMIN) · `DELETE /organisations/{id}/invitations/{invitationId}` (ADMIN).
- `POST /me/invitations/accept` `{ token }` — the caller must hold the invited address VERIFIED, so invitations sent before registration resolve after signup; every failure mode answers 404 `ORG_005`. `POST /me/invitations/decline` `{ token }`.
- `GET /me/organisations` — memberships with role · `DELETE /me/organisations/{id}` — leave (last-owner protected).

### 7.3 Verified domains (`/organisations/{id}/domains`) — mutations require ADMIN + AAL2

- `POST` `{ domain }` → 201 with `txtRecordName` (`_shadow-identity.<domain>`) and `txtRecordValue` (`shadow-identity-verification=<token>`).
- `POST /{domainId}/verify` — runs the TXT lookup and records evidence; statuses `PENDING → VERIFIED | FAILED`, re-check allowed. Only one org may hold a domain VERIFIED (partial unique index); a VERIFIED domain never demotes on a failed re-check — removal is explicit.
- `GET` (members) · `DELETE /{domainId}`.

Verified domains are the attachment point for SAML/SCIM/JIT provisioning (M7b); email-domain auto-capture is deliberately deferred to inbound federation (T-702).

## 8. SAML 2.0 IdP (`/saml2/*`) — _implemented (M7b, T-701)_

SP-initiated SSO: HTTP-Redirect binding in, HTTP-POST binding out.

- `GET /saml2/metadata` — IdP metadata (`application/xml`, cached 300 s): entity id (= OIDC issuer), every non-retired RSA signing certificate (active first, so SPs keep verifying across rotation), both NameID formats, and the redirect-binding SSO location.
- `GET /saml2/sso?SAMLRequest=&RelayState=` — decodes the deflated AuthnRequest, resolves the issuer against the registered service providers, and exact-matches any `AssertionConsumerServiceURL` in the request against the registration. A live session answers immediately with an auto-submitting HTML form (CSP allows only the hashed one-line submit script) posting the signed response to the registered ACS; otherwise the request parks in Redis under a single-use resume id (10 min TTL) and the browser is sent to the hosted login with `return_to=/saml2/sso/resume?rid=…`.
- `GET /saml2/sso/resume?rid=` — completes a parked request once (replayed resume ids answer `410 SML_003`).

Assertions are signed (enveloped XML-DSIG, RSA-SHA256, exclusive c14n) with a dedicated RSA-2048 key lineage (`signing_keys.purpose = SAML`) — Ed25519 is not interoperable in the SAML ecosystem. Assertions live 5 minutes and carry `InResponseTo`, `Recipient` (registered ACS), `AudienceRestriction` (SP entity id), `SessionIndex` (IdP session), and the registered subset of `email · first_name · last_name · display_name`. `PERSISTENT` NameIDs are stable pairwise HMACs per (user, SP) derived from the master key; `EMAIL` NameIDs are the primary address. SP AuthnRequest signatures are NOT verified (recorded decision: nothing security-relevant is taken from the request — assertions only ever go to the registered ACS; hand-rolled XML-DSIG _verification_ invites signature-wrapping attacks). Assertion encryption, SLO, and IdP-initiated SSO are deferred (recorded in tasks.md).

Administration: `GET/POST /api/v1/admin/saml/service-providers`, `GET/PATCH/DELETE /…/{id}` under `iam:clients:read`/`iam:clients:manage` (same owner as OAuth clients), AAL2 on mutations; ACS URLs must be https.

## 9. SCIM 2.0 provisioning (`/scim/v2/*`) — _implemented (M7b, T-704)_

RFC 7644 Users + Groups per organisation, plus `/ServiceProviderConfig`, `/ResourceTypes`, `/Schemas`. Auth: an ordinary client-credentials service token carrying `scim:provision` from a SERVICE client **bound to the organisation** (`oauth_clients.organisation_id`) — recorded decision: the reserved `scim_tokens` table was subsumed by org-bound service clients, which already give per-tenant rotatable credentials (dual-secret overlap), introspection and revocation. Responses use `application/scim+json` and the RFC error envelope (`schemas: […:Error]`, `status`, `scimType`); requests may send the same media type. Supported: `filter=<attr> eq "value"` on `userName`/`externalId` (Users) and `displayName`/`externalId` (Groups), `startIndex`/`count` pagination (max 500), PATCH add/replace/remove — including Entra's string booleans (`"False"`) and `members[value eq "…"]` removal form.

Ownership rules (recorded): `userName` must be an email under one of the org's **VERIFIED domains** (closes the enumeration oracle — probing foreign domains fails identically); provisioning an existing verified account **adopts** it (`managed = false`); `userName` is immutable; profile fields are written to managed accounts only. Deprovisioning (`active = false` or DELETE): managed accounts are DISABLED with sessions/refresh-tokens revoked and back-channel logout fanned out; adopted accounts only lose org membership and org-scoped refresh-token families — the account itself is never touched. Reactivation restores status/membership. Provisioned accounts have no password and sign in via email OTP or federation until they set one. Groups carry no authorization semantics yet (group→role mapping deferred; recorded in tasks.md).

## 10. Inbound OIDC federation (`/api/v1/auth/federated/*`, org IdP config under `/organisations/{id}/identity-providers`) — _implemented (M7b, T-702)_

Home-realm discovery: `POST /auth/login/init` with an email under an organisation's VERIFIED domain (T-703) that has an active identity provider returns a `federated` option (`authorizationUrl`, `enforced`). Non-enforced realms keep every local method; enforced realms answer `AWAITING_FEDERATED` and every local first-factor step (password, OTP, method change) refuses with `AUTH_007` — except for platform administrators (break-glass, recorded: a broken upstream must never lock operators out). The server-side RP uses authorization-code + PKCE with per-flow `state`/`nonce`/verifier held only in the flow store; ID tokens verify against the upstream JWKS (RS256/ES256/EdDSA allow-list), require issuer/audience/nonce match and `email_verified: true`.

`GET /auth/federated/callback?state&code` completes the round-trip: returning identities match on **(provider, subject)** — never bare email after first link. First-time subjects whose email belongs to an existing account get `AWAITING_LINK_OTP`: an email OTP must prove control before the upstream identity links (silent auto-link on email equality is an account-takeover vector — recorded). Unknown users are JIT-provisioned (passwordless, email verified, org MEMBER). Federated proof is a first factor: MFA-enrolled accounts still walk their local second factor. All callback failures collapse into one neutral `?error=federation_failed` redirect.

Configuration (org ADMIN + AAL2, same ceremony as domains): `GET/POST /organisations/{id}/identity-providers`, `PATCH/DELETE /…/{idpId}` — issuer passes the SSRF guard, endpoints come from the issuer's own discovery document (RFC 8414 issuer-match enforced), the upstream client secret is AES-256-GCM enveloped and never echoed. One IdP per organisation (409 on a second). Deferred + recorded: SAML inbound federation, group/claim mapping, forced re-auth (`prompt=login`) on step-up.
