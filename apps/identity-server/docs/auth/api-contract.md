# Shadow Identity — Interactive Auth API Contract

| | |
| :--- | :--- |
| **Status** | Approved for development |
| **Version** | 2.0.0 |
| **Last updated** | 2026-07-11 |
| **Base URL** | `https://identity.shadow-apps.com/api/v1` |
| **Supersedes** | v1. Token-cookie delivery (`AT`/`RT` cookies) and `POST /auth/session/refresh` are **withdrawn** — the browser holds only the `__Host-sid` session cookie (decision D-10); applications use `/oauth2/*` (see `docs/architecture.md` §12). |

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
```jsonc
// 200
{ "flowId": "…", "methods": [
  { "name": "PASSWORD" },
  { "name": "WEBAUTHN" },
  { "name": "EMAIL_OTP", "metadata": { "maskedEmail": "j***@example.com" } },
  { "name": "SMS_OTP",  "metadata": { "maskedPhone": "**99" } }
] }
```

### 2.3 `POST /auth/challenge/change`
```jsonc
{ "flowId": "…", "method": "SMS_OTP" }
// 200 → { "status": "AWAITING_SMS_OTP", "resendsLeft": 3, "metadata": { "maskedPhone": "**99" } }
```

### 2.4 `POST /auth/challenge/resend`
```jsonc
{ "flowId": "…", "method": "EMAIL_OTP" }
// 200 → { "status": "SENT", "resendsLeft": 2, "retryAfterSeconds": 60 }
// 429 — { "code": "RESEND_LIMIT", "retryAfterSeconds": 3600 }
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

### 4.2 `POST /auth/signout` — global sign-out
Requires session + CSRF. `204`; clears cookies; revokes session, RT families; dispatches back-channel logout.

### 4.3 `POST /auth/step-up`
Re-authentication for sensitive operations: starts a `STEP_UP` flow bound to the current session; on completion sets `elevated_until = now() + 10m`. Same challenge endpoints as login.

### 4.4 Session management (under `/me`)
- `GET /me/sessions` — list active sessions/devices (current flagged).
- `DELETE /me/sessions/{sessionId}` — revoke one (step-up required).
- `DELETE /me/sessions` — revoke all except current (step-up required).

### 4.5 MFA management (under `/me/mfa`, session cookie + CSRF) — *implemented (M4)*
- `GET /me/mfa` — list verified enrollments (TOTP + passkeys).
- `POST /me/mfa/totp/enroll` → `{ secret, uri }` (base32 seed + otpauth URI, shown once). Adding the *first* factor needs only a session; changing factors once MFA exists requires elevation.
- `POST /me/mfa/totp/activate` `{ code }` → `{ success, recoveryCodes? }` — proof-of-possession activates the enrollment; the account's first factor also returns its one-time recovery-code batch.
- `DELETE /me/mfa/totp` — step-up required.
- `POST /me/mfa/step-up` `{ code }` → `{ aal, elevatedUntil }` — elevates the current session to AAL2 via TOTP.
- `POST /me/mfa/recovery-codes` → `{ recoveryCodes }` — regenerates (step-up required); previous batch is retired atomically.

### 4.6 WebAuthn (passkeys) — *implemented (M4)*
- `POST /me/webauthn/register/options` / `POST /me/webauthn/register/verify` `{ …attestation, label? }` — registration ceremony; challenges live server-side (Redis, 5 min, single use). First factor returns recovery codes.
- `DELETE /me/webauthn/{credentialId}` — step-up required.
- `POST /auth/webauthn/options` `{ flowId? }` → `{ flowId, options }` — assertion options; without `flowId` begins a usernameless (discoverable) login, with one serves the flow's MFA step. Neutral either way (D-12).
- `POST /auth/challenge/verify` `{ flowId, webauthn: <assertion> }` — completes the passkey step; also accepts `{ code }` (TOTP at `AWAITING_TOTP`) and `{ recoveryCode }` at any MFA step. Sessions completing MFA (or a user-verified passkey first factor) record `AAL2`.

### 4.7 Emails & phones (under `/me`, session cookie + CSRF) — *implemented (M4)*
- `GET /me/emails` · `GET /me/phones` — list with `isPrimary` / `verifiedAt`.
- `POST /me/emails` `{ email }` → `{ verificationId }`; `POST /me/emails/verify` `{ verificationId, code }`. Same pair for `/me/phones` (SMS OTP). Neutral when the address is verified elsewhere (D-12).
- `POST /me/emails/primary` · `POST /me/phones/primary` — verified identifiers only.
- `DELETE /me/emails` · `DELETE /me/phones` (body carries the identifier) — the primary cannot be removed. Unverified claims expire after 7 days (worker).

## 5. OAuth 2.1 / OIDC endpoints

Specified in `docs/architecture.md` §12; not duplicated here. The interactive flows above are reachable from `/oauth2/authorize` when no valid session exists, via `oidcResume` (§2.6).
