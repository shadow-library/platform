# Identity

The platform's identity provider: OIDC/OAuth 2.1 authorization server, account system, M2M token issuer and central authorization decision point (PDP). `identity-server` is the
JSON API (Postgres, Redis, plus a worker); `identity-web` is its SSR UI (login, account portal, admin console) and is presentation only. Every other app authenticates through
Identity and never stores credentials. This is the only doc that describes the auth model; SDK integration rules are in `docs/packages.md`.

## Capabilities

- Accounts and organisations (personal workspace per user; team orgs add members, bots, SCIM, inbound OIDC federation, third-party OAuth apps). Sign-in methods are
  admin-toggleable: PASSWORD, WEBAUTHN, EMAIL_OTP on; SMS_OTP, GOOGLE, MICROSOFT, APPLE off. SAML service providers are platform-admin data, not org data.
- OIDC provider (code + PKCE, refresh, back-channel logout, RFC 8693 exchange), M2M `client_credentials`, first-party app sessions (opaque handle, short-lived tokens), a
  role-based PDP (`authz/check`), a user-resolve directory for services, and webhooks (platform-admin subscriptions, worker-delivered; every audit write fans one out).
- `identity-web` console: app registry, clients, resources, users, roles, SAML, webhooks, auth modes. Service-access rules are admin API only; org security policies live in the org portal.

## Concepts

- Organisation: the tenant boundary. A `PERSONAL` org is created with the user and cannot be joined, deleted separately or converted. Member roles govern org administration only.
- Application: the unit of identity (by convention one OAuth client + one API resource; admins may add more). First-party apps skip consent but never the protocol; third-party clients are
  org-registered, need consent and may hold refresh tokens.
- AAL2 (second factor) is a claim, not permission. Step-up (elevation) is a short re-authentication proof that unlocks sensitive operations.

## Architecture

- Browser to Identity uses an opaque server-side session cookie (hashed at rest) through one origin: a reverse proxy sends API/OAuth/SAML paths to `identity-server`, the rest to
  `identity-web`. Register/login/recover are short-lived Redis flows that end in a session; OAuth artifacts are minted only by the OAuth endpoints, the app-sessions API and `ServiceTokenService` (Identity's own outbound M2M calls).
- Postgres is authoritative; Redis holds only flows, rate limits, caches and counters. Signing keys are EdDSA; rotation exists in `KeyService` but nothing calls it, so there is no
  automated or admin rotation path. The `token_type` claim (user, service, bot) discriminates principals.
- PDP/PEP: Identity decides; consuming services enforce via `@shadow-library/auth` (`packages/auth`), configured with issuer, app id and one credential. Its guards verify tokens
  offline against JWKS and call the PDP with a cached decision (shorter for `highRisk`); it also serves first-party login/callback/logout/step-up routes.
- Identity's own routes use `@Auth({ ... })`; an undecorated route is unguarded, so state intent with `public: true`. Access errors are codes; `identity-web` owns copy.

## Flows

- First-party login: app redirects to authorize (code + PKCE); Identity logs the user in, checks app access, returns a single-use code. The app backend exchanges it (with its own
  M2M token) for an app-session handle, set as a cookie on its own domain. Every app-session mint and refresh re-validates the central session, app access and scope entitlements (the code exchange checks user
  status, app access and scopes, not the session).
- Sign-out revokes the central session and refresh families and queues back-channel logout (worker-delivered, only to clients with a refresh family and a logout URI);
  first-party apps learn at their next mint. An app ends only its own session.
- M2M: `client_credentials` with `resource` yields a token with `aud` = target, `sub` = client id. In-cluster clients use a workload-identity assertion; others use the client's
  configured auth method (secret or private key).
- Acting as a user across apps: RFC 8693 exchange keeps `sub`/`org`/`sid`, adds `act`, carries no `aal` (so it never satisfies an `elevated` route), expires no later than the subject token and carries only the caller's own grants
  on the target, never sensitive scopes. Only the token's audience owner may exchange; a token already carrying `act` is refused (single hop).
- App step-up: the app sends the user to Identity's step-up page with its intent, then claims it, creating a grant for exactly one (app session, audience) pair. `elevated` mints
  require that grant; app-session mints issue `is_sensitive` scopes only into such a token.
- Recovery: OTP proves email control; MFA-enrolled accounts also need a TOTP code or recovery code (a passkey is not accepted); reset revokes all sessions. A verified org domain can force logins to its IdP.

## Access control

- Three axes; NEVER collapse them. Visibility (platform admin, per app): PUBLIC, RESTRICTED (released per org), INTERNAL (platform org only). Assignment (org admin edits the allowlist, only an
  OWNER changes the mode; both elevated): ALL_APPS or an ASSIGNED_ONLY allowlist. Capability: roles to permissions in the PDP; entitlement tiers belong here, never in the sign-in gate.
- A user may access an app iff some membership whose suspension is not in force, in an ACTIVE org, grants that active app. Personal workspace grants PUBLIC apps only; an active
  org-owned app is always reachable by its owner org. SCIM-managed users are limited to the managing org(s) account-wide. `client_credentials` is exempt (governed by service-access rules).
- INTERNAL or inactive apps look identical to an unknown client. The gate runs at authorize, SAML SSO, every app-session mint, refresh and exchange (when the target is app-owned); unassignment is a hard cut at next mint. Token
  `org` is one org that actually grants the app; an app session realigns to another granting org and is revoked only when none does, but a refresh family is revoked as soon as its
  own org stops granting. Switching org rotates the handle. Access grants are cached in Redis under a version key: any visibility, release, assignment or mode write MUST bump it.
- Service-access rules (app x caller client x method x path) are admin data; `kind=service` callers are denied by default. Org security policies fold per key over platform
  default, client and orgs (MIN for the duration keys, AND for the email-OTP fallback): an org may tighten, never loosen.
- Role catalogs are pushed by each app that opts in (pulse's sync is off; its catalog is seeded in identity) as a full sync scoped to that app; absent roles are deleted with
  their assignments. Services define roles and NEVER assign them to users (default roles apply to everyone implicitly). Org-wide role grants and SCIM group-to-role mappings are vendor-controlled (platform role admins), never org admins.
- Bots: team orgs only; a first-party resource server exchanges a bot key for a short org-bound token pinned to its own audience. Grants require a bot-eligible role the granting
  admin holds. Bots are denied everywhere unless a route declares `@BotPermission` (SDK) or an `@Auth({ bot: <permission> })` string, never reach elevated routes, and act on MEMBERs only.
  Deleting a bot is a worker-drained handover to bot-aware apps (`/internal/bots/*`; only novel-forge implements it).

## Hard rules

- NEVER put tokens, secrets, session handles, PKCE verifiers, bot keys or `Authorization` headers in logs, audit payloads or URLs (the CSRF token is the one thing logged).
  Secrets appear in a response only once, at mint (app-session handle, bot key, client/webhook secret). Refresh secrets, handles and session cookie secrets are stored only as
  hashes (the numeric session id ships as `sid`). NEVER return fields not declared on a `@RespondFor` DTO (SCIM, SAML and federated-callback routes own their wire format).
- MUST require PKCE S256 and exact-string redirect-URI match for every client; no wildcards, open `redirect_uri`, implicit, ROPC or dynamic client registration. Sanitize
  `returnTo`. MUST NOT rely on SameSite for CSRF: state-changing browser endpoints use the double-submit token.
- Access tokens carry identity, tenant, audience, scope and protocol claims, never roles or permissions. Verifiers MUST allowlist EdDSA and check iss, aud, exp.
- A scope is minted only for the resource that owns it and only if the client holds a scope there; unknown and un-entitled resources look identical. Grants re-resolve per mint.
- First-party clients get no refresh tokens (provisioning policy; the admin API does not stop it); the app-session handle is inert without the app's own M2M credential and is bound to its `client_id`. Code redemption MUST verify the
  caller owns the code's client. Third-party refresh tokens rotate on every use; reuse revokes the family and terminates the session.
- Elevation is spent, not held: never crosses an app or audience boundary; exchanged tokens are never AAL2; an app-begun step-up is invalid for Identity's own `elevated` routes.
- Enumeration: `register/init` and `recover/init` MUST stay indistinguishable for known and unknown identifiers. `login/init` deliberately reveals unknown and blocked accounts
  (containment is rate limiting, which fails closed on auth endpoints). Recovery MUST apply the same status gate before resetting a password.
- Audit events are append-only by convention and hash-chained (per organisation, or one global chain for org-less events); every privileged action MUST be audited by hand. Emails go through the transactional outbox, never in-request.
- No service other than Identity reads or writes its database. No in-process state may be authoritative: assume multiple replicas (known exception: `ApplicationService`'s app cache refreshes only on the writing replica). Tenant-owned rows carry `organisation_id`. An
  org MUST always keep at least one OWNER (demote, remove, leave, suspend refuse to strip the last).
- SDK: the first registration resolve (when the browser flow is on) and first service-access load MUST fail boot; later refreshes warn and keep the last good value. Bot keys
  are bearer credentials: set `APP_TRUST_PROXY` to the ingress CIDRs, never `true` (only warned, not refused), or IP allowlists can be spoofed.

## Non-goals

- No refresh-token-based first-party sessions, public/native first-party clients, RP-initiated logout (the SDK's `endSessionUrl` machinery does nothing against this IdP) or per-route caller allowlists in code (rules are admin data). SAML is
  SP-initiated SSO only; no DPoP/mTLS or multi-region residency. Revocation is bounded, not instant (tokens, PDP cache, service-access rules, JWKS); `highRisk` shortens only the
  PDP decision cache.
