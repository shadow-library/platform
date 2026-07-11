# Shadow Identity — Development Backlog

|                  |                          |
| :--------------- | :----------------------- |
| **Status**       | Approved for development |
| **Version**      | 1.0.0                    |
| **Last updated** | 2026-07-11               |

This is the authoritative build plan to take Shadow Identity from its current state (schema + design + DI skeleton, no working auth) to a secure, scalable production platform, then to enterprise readiness. It implements `docs/architecture.md`, `docs/database.md`, `docs/auth/*`, and `docs/sdk.md`.

## How to read this

- Milestones **M0–M9** are ordered; a milestone SHOULD NOT start until its predecessor's exit criteria pass. Within a milestone, tasks may parallelise unless a dependency is stated.
- **Effort**: S (≤1 day), M (2–4 days), L (1–2 weeks), XL (>2 weeks). Estimates assume one engineer familiar with the `@shadow-library` framework.
- Every task's **Definition of Done** includes: code + unit/integration tests + migration (if schema) in the same PR, lint/type-check/`drizzle-kit generate` clean, and docs updated if behaviour diverges from spec.
- **Security impact** and **blocks-production** flags carry over from the architecture review.

---

## M0 — Immediate remediation (correctness & safety)

**Goal:** eliminate the dangerous defects in the existing code and repair the build/migration pipeline before anything is layered on top. Nothing here is optional.

### T-001 — Fix `getUser` wrong-user lookup · S · Sec: Critical · Blocks prod

- **Change:** `src/modules/identity/user/user.service.ts:135-142`. The `db.query.users.findFirst({ with: { emails: { where } } })` pattern filters child rows, not parents, so an email/phone lookup returns the first user in the table.
- **Fix:** resolve via subquery on the child table:
  `where: inArray(users.id, db.select({ id: userEmails.userId }).from(userEmails).where(filter.sql))` (and the phone equivalent). Route username/id through the direct predicate as today.
- **DoD:** test proving a lookup for user B's email returns B (not A); lookup for a nonexistent identifier returns `null`.

### T-002 — Fix `updateUserStatus` mass-update · S · Sec: Critical · Blocks prod

- **Change:** `user.service.ts:144-164`. `update(users).set(...).from(table).where(...)` has no join predicate → updates every `users` row.
- **Fix:** `update(users).set({ status }).where(inArray(users.id, <subquery over child table>))`; assert affected-row count ≤ 1.
- **DoD:** test seeding 3 users proving `updateUserStatus(<one email>, 'BLOCKED')` changes exactly one row.

### T-003 — Remove hardcoded super-admin credentials · S · Sec: Critical · Blocks prod

- **Change:** `src/modules/identity/user/user.module.ts:34-53` seeds `super-admin@shadow-apps.com` / `Password@123`.
- **Fix:** replace with a one-time bootstrap: on first boot with no platform admin, generate a random password, print it once to stdout, create the user in `PENDING` state requiring password reset on first login; OR gate on `IDENTITY_BOOTSTRAP_ADMIN_EMAIL` + a `MASTER_ENCRYPTION_KEY`-derived one-time token. No literal secret in source, ever.
- **DoD:** grep for `Password@123` returns nothing; boot on a fresh DB yields no known-credential account.

### T-004 — Repair migration pipeline & reset baseline · S · Blocks prod

- **Change:** `drizzle.config.ts:23` points at `./src/modules/database/schemas/index.ts` (removed in PR #17). The only migration predates half the schema.
- **Fix:** correct path to `./src/modules/infrastructure/datastore/schemas/index.ts`; delete stale journal + `0000_burly_punisher.sql`; regenerate a clean `0000` baseline; add CI step failing if `drizzle-kit generate` produces a diff.
- **DoD:** fresh DB builds from migrations; CI drift check green.

### T-005 — Correct audit schema so audit survives · S · Sec: High

- **Change:** `auth-tokens.schemas.ts:79-100` (`user_sign_in_events`): `user_id NOT NULL` + implicit coupling defeats the stated audit purpose.
- **Fix:** `user_id` nullable, no cascade (app-level `SET NULL`); keep `identifier`; add `(identifier, created_at)` and `(ip_address, created_at)` indexes for Tier-4/abuse queries; rename toward `sign_in_events` per target model.
- **DoD:** a failed attempt for an unknown identifier is recordable; deleting a user does not delete their sign-in history.

### T-006 — Fail-closed configuration · S · Sec: High · Blocks prod

- **Change:** `src/bootstrap.ts` defaults production secrets (DB URL, Redis) to localhost values.
- **Fix:** in `Config.isProd()`, require `PRIMARY_DATABASE_URL`, `REDIS_URL`, `MASTER_ENCRYPTION_KEY` — abort boot if absent. Keep dev defaults behind `isDev()`. Expand `.env.example` to list every variable actually read.
- **DoD:** prod boot without the three secrets exits non-zero with a clear message.

### T-007 — Wire modules into the app · S · Blocks prod

- **Change:** `src/app.module.ts` imports only `HttpRouteModule`; `UserModule`/`ApplicationModule` are dead code. `application.service.ts:75,90` also call `loadApplications()` without `await`.
- **Fix:** compose modules under a top-level `IdentityModule`/`SystemModule`; `await` cache reloads; confirm `onModuleInit` ordering (applications before the admin-user seed that references them).
- **DoD:** app boots with all modules; existing health test still green; no unhandled promise warnings.

**M0 exit criteria:** all tests green in CI _with a real Postgres_ (see T-008); no Critical review findings remain; reproducible DB from migrations.

---

## M1 — Production foundation (make it a real service)

**Goal:** the infrastructure and primitives every later milestone needs.

### T-008 — DB-backed integration test harness · M · Sec: High

- **Change:** `.github/workflows/code-test.yml` runs `bun test` with no database.
- **Fix:** add an ephemeral Postgres (+ Redis) service to CI; provide a test bootstrap that migrates a scratch DB and truncates between tests; port the existing single health test onto it. This is the harness that would have caught T-001/T-002.
- **DoD:** integration tests run in CI against real Postgres/Redis.

### T-009 — Adopt `DatabaseModule` + `CacheModule`, drop local datastore · M · Sec: Medium

- **Change:** replace `DatastoreService` (`infrastructure/datastore/datastore.service.ts`) — which hand-manages Drizzle/ioredis/Memcached and has an unsafe SQL-param-interpolating debug logger — with `@shadow-library/modules` `DatabaseModule` (≥0.5) and `CacheModule` (D-6, D-14). Remove Memcached entirely.
- **Fix:** keep the Drizzle schemas; register `DatabaseModule.forRoot({ postgres, redis })`; expose typed repositories. Delete `datastore.constants.ts` param-interpolation logger; rely on the module's `renderPostgresQuery` (debug-gated).
- **DoD:** no direct `new Redis()`/`drizzle()` in app code; Memcached dependency removed from `package.json`; secrets never interpolated into logged SQL.

### T-010 — UUIDv7 keys + prefixed external IDs · M · Blocks later work

- **Change:** migrate all PKs from `bigserial`/`serial` to `uuid` (D-8) generated by `Bun.randomUUIDv7()`; add an ID codec (`usr_`, `org_`, `sess_`, `cli_`, `app_` per `docs/standards.md`) at the API boundary.
- **Fix:** schema migration (fresh baseline, so mechanical); central `IdService` for generate/encode/decode/validate.
- **DoD:** all new rows get UUIDv7; API emits/accepts prefixed IDs; internal storage is bare `uuid`.

### T-011 — Key management + JWKS + rotation · L · Sec: Critical · Blocks tokens

- **Change:** implement `auth/keys` module and `signing_keys` table (D-9, DB §8). `KeyProvider` interface (env-KEK impl now, KMS later) doing AES-256-GCM envelope encryption of Ed25519 private keys.
- **Fix:** generate/activate/rotate/retire state machine; exactly one `ACTIVE`; pre-publish `PENDING`; `GET /.well-known/jwks.json` (current + previous, `max-age=300`); signing service used by all token issuance; worker job for 90-day rotation + emergency rotate admin action.
- **DoD:** tokens sign under `kid`; JWKS verifies them; rotation test proves tokens signed by key N verify after activating N+1 and rejecting retired keys.

### T-012 — Session subsystem + harden CSRF · L · Sec: High

- **Change:** `auth/session` module + `user_sessions`/`devices` tables (DB §7). Opaque `__Host-sid` (SHA-256 stored), Redis-cached lookup (60 s) with explicit invalidation, idle/absolute timeouts, fixation prevention, `elevated_until` step-up (D-10, overview §6).
- **Fix (framework):** the `HttpCoreModule` CSRF token is a plain, non-constant-time double-submit (`csrf-token.service.ts`); make it HMAC-signed and `crypto.timingSafeEqual`-compared. Coordinate in the `modules` repo; pin the new version here.
- **DoD:** login issues a session; validation is cache-fast; revocation is immediate; CSRF compare is constant-time and signed; session-fixation test passes.

### T-013 — Pinned argon2id + password policy + history · M · Sec: High

- **Change:** `user.service.ts:121` uses `Bun.password.hash` with implicit params.
- **Fix:** pin `argon2id` (`memoryCost: 65536`, `timeCost: 3`), record `params_version` (DB §2); `password_history` table (last 5); verify-time rehash on param change; policy module (length, breach check via HIBP k-anonymity with soft-fail + async re-check job).
- **DoD:** params recorded per credential; reused password rejected; breached password rejected (mockable in tests).

### T-014 — Notifications (outbox) + jobs runtime + worker process · L · Sec: Medium

- **Change:** `infrastructure/notification` (templated email via `notification_outbox`) and `infrastructure/jobs` (Postgres `FOR UPDATE SKIP LOCKED` queue) + a second `worker` entrypoint (D-13, arch §13.4–13.5).
- **Fix:** outbox written inside domain transactions; worker drains with backoff/DLQ/idempotency; jobs: notification dispatch, expiry sweeps (sessions/tokens/challenges/flows), lockout release, HIBP re-check.
- **DoD:** email send never blocks/rolls back a request; worker processes and retries; dead-letter observable.

### T-015 — Auth flow engine: registration, login, recovery · L · Sec: High · Blocks product

- **Change:** `auth/flow` module using `FlowManager`/`FlowRegistry`; `verification_challenges` table; Redis flow context (overview §1); the corrected flows (overview §3–5) and API (api-contract §1–3), including the **new dedicated password-set step** and enumeration neutrality (D-12).
- **Fix:** tiered rate limiting (overview §8) in Redis; personal-workspace creation in the registration commit (T-018 dependency); `sign_in_events` writes; masked-destination metadata.
- **DoD:** end-to-end register/login/recover integration tests; neutrality test (known vs unknown identifier responses identical); Tier-3/Tier-4 lockout tests.

### T-016 — Refresh-token families + rotation · M · Sec: High · Blocks OAuth

- **Change:** `refresh_token_families`/`refresh_tokens` tables (DB §7); unconditional rotation with reuse detection (D-11, arch §17.3). Fix the v1 defects: drop `unique(session_id, application_id)`, make `previous_token_id` a self-uuid-FK.
- **Fix:** rotate on every use; presenting a `ROTATED`/`REVOKED` member revokes the family + session and emits `security.token_reuse`.
- **DoD:** rotation test; reuse-detection test (revoked member ⇒ family+session dead); concurrency test (parallel refresh of one token ⇒ exactly one succeeds).

### T-017 — Audit pipeline (hash-chained) · M · Sec: High

- **Change:** `infrastructure/audit` + `audit_events` (DB §9): append-only, no FKs, per-org SHA-256 chain, monthly partitions, `request.cid` correlation.
- **Fix:** audit emit points across auth/admin/client/key/consent/grant/session events; worker chain-verification job; redaction of PII/secrets in `detail`.
- **DoD:** privileged actions produce chained rows; tamper (row edit) fails verification; no secret/PII in payloads.

### T-018 — Tenancy: synthetic personal workspace + isolation harness · L · Sec: Critical

- **Change:** `identity/organisation` module; `organisations`/`organisation_members` per target model; personal-workspace creation (D-1) wired into registration; `organisation_id` added to every tenant-owned table.
- **Fix:** repository layer requiring an org context on tenant tables; **isolation harness** — a test suite attempting cross-tenant read/write on every tenant repository method, failing the build on any leak (arch §7.3).
- **DoD:** every user has exactly one personal org from registration; isolation harness green and wired into CI.

**M1 exit criteria:** password login → session → refresh works end-to-end with tests; keys rotate safely; audit + tenancy isolation enforced; worker operational; CI runs against real datastores.

---

## M2 — OAuth 2.1 / OIDC authorization server

**Goal:** standards-based application login and M2M, replacing the withdrawn bespoke SSO.

### T-201 — Client & resource model + admin registration · L · Sec: High

- `applications` (extended), `oauth_clients`, `oauth_client_secrets` (argon2id, dual-secret rotation), `oauth_client_redirect_uris` (exact match), `oauth_client_origins`, `api_resources`, `scopes`, `oauth_client_scope_grants`, `application_keys` repurposed for `private_key_jwt` (DB §5). Admin APIs to register/rotate.
- **DoD:** register a first-party client; rotate a secret with overlap; redirect URIs exact-match validated (wildcard rejected).

### T-202 — Authorization Code + PKCE + discovery · L · Sec: Critical · Blocks first-party SSO

- `GET /.well-known/openid-configuration`, `GET /oauth2/authorize` (mandatory PKCE S256, exact redirect match, Redis-stored single-use 60 s codes bound to client/redirect/PKCE/nonce/session), `oidcResume` handoff to the login flow (arch §8.3, §17.1). First-party consent bypass with recorded consent (D-4).
- **DoD:** full code+PKCE login for a first-party app; tampered `redirect_uri`/`code_verifier`/reused code all rejected.

### T-203 — Token, refresh, client-credentials, UserInfo · L · Sec: Critical

- `POST /oauth2/token` (`authorization_code`, `refresh_token` via T-016, `client_credentials` via D-2/arch §8.4 with `resource` RFC 8707 + scope-grant checks), `GET /oauth2/userinfo`, ID token minting (nonce, acr/amr). Client auth: `client_secret_basic` + `private_key_jwt` (RFC 7523).
- **DoD:** all three grants issue correct tokens; `aud`/scope enforcement; algorithm allowlist honoured.

### T-204 — Revocation, introspection, logout, back-channel · M · Sec: High

- `POST /oauth2/revoke` (RFC 7009), `POST /oauth2/introspect` (RFC 7662, confidential only), `GET /oauth2/logout` (RP-initiated), OIDC back-channel logout tokens to registered clients (arch §17.5).
- **DoD:** revoke kills a family; global sign-out triggers back-channel logout received by a test RP.

### T-205 — Consent records + withdrawal · M · Sec: Medium

- `consents` table; first-party `FIRST_PARTY_POLICY` records; `GET/DELETE /me/consents`. (Consent _screen_ deferred to third-party enablement, M8, but records exist now — D-4.)
- **DoD:** consent recorded on first authorize; withdrawal revokes grants + tokens.

**M2 exit criteria:** a first-party Bun app logs users in via OIDC through the SDK RP helper; services obtain M2M tokens; OIDC conformance suite (OP Basic + Config) passes (T-309).

---

## M3 — Authorization (PDP) + SDK

**Goal:** central permission decisions and the consumer package.

### T-301 — RBAC model + PDP API · L · Sec: High

- `permissions`, `application_roles` (extended), `role_permissions`, `role_assignments` (org-scoped, principal = user|service) per DB §6 — **this fills the gap where roles cannot currently be assigned to anyone.** `POST /api/v1/authz/check` (+batch), deny-by-default, `authz_version` invalidation (arch §11, §17.4).
- **DoD:** assign a role; PDP returns PERMIT/DENY correctly; grant change bumps version and invalidates cached decisions; authorization-matrix tests pass.

### T-302 — `@shadow-library/auth` SDK v1 · XL · Sec: Critical

- Build the package per `docs/sdk.md` as the **in-repo workspace package `packages/auth`** (decision: same repo as the identity server because the two share protocol logic and the SDK is integration-tested against the real server): Bun-native Ed25519 verify (JWKS cache + unknown-`kid` refetch), `AuthModule` guards (`@Authenticated`, `@RequirePermission`, `@RequireScope`, `@AllowService`), PDP client (60 s cache), M2M token manager (singleflight), RP helper (PKCE/state/nonce), `createTestIdP` utilities. Session-cookie adapters and back-channel logout ship with T-303 when the first consumer integrates.
- **DoD:** a reference consumer service verifies tokens with no network on the hot path, enforces a permission via PDP, and calls another service M2M — all through the SDK; fail-closed behaviour tested.

### T-303 — Migrate one real service (`pulse-server`) as reference · L

- Integrate the SDK into an existing sibling app end-to-end (user login via RP helper + one M2M call + one permission-guarded route) to validate the contract against reality before broad rollout.
- **DoD:** `pulse-server` authenticates users and services solely through Shadow Identity + SDK.

### T-309 — OIDC conformance run · M · Sec: High

- Run the OpenID Foundation OP Basic + Config conformance profiles against a staging deployment; fix findings.
- **DoD:** conformance profiles pass; results archived.

**M3 exit criteria:** end-to-end user + service auth and authorization working through the SDK for at least one real service; conformance passed.

---

## M4 — MFA & credential hardening ✅ _(implemented; api-contract §4.5–4.7)_

### T-401 — TOTP enrollment + step-up · M · Sec: High — **done**

`mfa_enrollments` (AES-GCM seed + `last_used_counter` replay pin), enroll/activate/disable (step-up gated), login MFA state (`AWAITING_TOTP`), `AAL2` on sessions with a bounded elevation window. _(`acr`/`amr` token claims deferred to the OIDC surface as a follow-up.)_

### T-402 — WebAuthn / passkeys · L · Sec: High — **done**

`webauthn_credentials`; registration + assertion via `@simplewebauthn/server` (login MFA step `AWAITING_MFA_WEBAUTHN` and usernameless first factor at AAL2), sign-count regression → reject + `security.webauthn.counter_regression` audit, backup-eligibility recorded. Tests drive real ceremonies with a software authenticator.

### T-403 — Recovery codes + MFA-aware recovery · M · Sec: High — **done**

`recovery_codes` (argon2id, generations, single-use, consumption alerts the user); recovery flow requires TOTP or a recovery code for MFA accounts (overview §5) — closes the MFA-downgrade takeover.

### T-404 — Multiple verified emails/phones + management APIs · M · Sec: Medium — **done**

Verified-only uniqueness (DB §2, partial unique indexes), primary switching (verified-only), `/me` email/phone add/verify/remove, 7-day purge of stale claims (worker), login/recovery resolve verified identifiers only.
**M4 exit criteria:** users enroll TOTP + passkeys, generate recovery codes; recovery cannot bypass MFA. ✅

---

## M5 — Security intelligence & operational maturity

### T-501 — Rate-limit + abuse hardening pass · M · Sec: High — **done**

`SecurityModule`: Redis-backed Tier-1 middleware (`@RateLimit` routes fail closed, general budget fails open), dynamic IP deny list + config allowlist + kill switch; Tier-2 identifier cap centralised in `ChallengeService.issue`; Tier-4 OTP-only lock now enforced at the password step (arch §13.2). Also completed the contract §2/§4 surface: `challenge/methods`, `challenge/change` (OTP first factor), `challenge/resend`, `cancel`, `signout`. Fixed en route: the router's generated-middleware cache keyed on route metadata alone, silently sharing one handler between two generating middlewares (double-counted limits, skipped CSRF) — namespaced `cacheKey` here and in the SDK guard; the proper fix belongs in `@shadow-library/fastify` (cross-repo follow-up).

### T-502 — Suspicious-login detection · L · Sec: Medium — **done**

New-device/new-IP signals on successful logins (quiet on first-ever login) → `security.new_device_login` audit + alert email via outbox. **Deferred**: GeoIP/impossible-travel (needs an external location database) and forced step-up on suspicion (needs risk policy).

### T-503 — Security event correlation + alerts · M · Sec: Medium — **done**

Cross-account failed-login correlation per source IP → 1 h Tier-1 block + `security.ip_blocked`; unified `security.*` taxonomy with `securityEvent`-tagged structured logs (arch §13.3); token-reuse feeds the same taxonomy. Also secured the PDP: `POST /api/v1/authz/check` now requires a service token with the bootstrap-seeded `authz:check` scope (native KeyService verification; SDK requests the scope automatically).

### T-504 — Readiness, graceful shutdown, DR drill · M · Sec: High — **done**

`/health/ready` existed; worker now drains its in-flight tick on SIGTERM and requeues deliveries stranded in `SENDING` at boot; `docs/runbooks.md` covers key rotation/compromise, restore drill (RPO ≤5 m / RTO ≤1 h), token-reuse response, IP-block ops, bootstrap recovery, outbox ops, deploy order. The drill itself is an operational exercise, not code.

### T-505 — Container & supply-chain hardening · S · Sec: Medium — **done**

Non-root, version-pinned Bun image (digest pinned in CI via `--build-arg BUN_IMAGE`), `HEALTHCHECK`, dist-only context (`.dockerignore`), worker via `CMD` override, `docker-compose.dev.yml` for local datastores; CodeQL + test workflows retained. **Deferred**: dependency-audit gate and artifact signing (CI platform work).
**M5 exit criteria:** rate tiers enforced and fail-closed on the auth surface, suspicious logins alerted, security events on one taxonomy, PDP authenticated, worker crash-safe and drain-clean, runbooks published. ✅ (deferred: geo signals, forced step-up, CI supply-chain gates, the physical DR drill)

---

## M6 — Admin & platform surfaces

### T-601 — Admin vs platform-admin separation · M · Sec: High

Platform-admin role distinct from tenant OWNER/ADMIN; all admin actions step-up-gated + audited; break-glass procedure documented.

### T-602 — Account lifecycle admin APIs · M

Suspend/block/close/reactivate, soft-delete + 30-day retention, right-to-erasure workflow (PII scrub, audit skeleton preserved).

### T-603 — Login/account UI · L

Build the hosted login/registration/recovery/consent UI with `@shadow-library/ui`; wire to the auth-flow API.

---

## M7 — Enterprise readiness (deferred; designed-for per D-7 & DB §11)

Each is specified at start; schema names are reserved now.

- **T-701 SAML 2.0 IdP** · XL — signed/encrypted assertions, metadata + cert rotation, replay guard.
- **T-702 Inbound OIDC/SAML federation** · XL — `identity_providers`, home-realm discovery, JIT provisioning, claim/group mapping, break-glass local admin, tenant-takeover prevention.
- **T-703 Verified domains** · L — `organisation_domains`, TXT proof, domain-based routing.
- **T-704 SCIM 2.0** · XL — Users+Groups, `scim_tokens` (per-tenant, rotatable), idempotency, deprovisioning → session/token revocation.
- **T-705 Team organisations** · L — invitations, membership management, resource migration from personal→team.
- **T-706 Webhooks / event stream** · L — `webhook_subscriptions`, signed deliveries, retries.

---

## M8 — Third-party developer platform (deferred)

Consent screen enablement, third-party client review, publisher verification, sensitive-scope gating, per-app rate limits/quotas, developer docs + example apps. Requires M2 + M6.

---

## M9 — Advanced (deferred; not before foundations are mature)

Risk-based/adaptive auth; device authorization grant (only if TV/CLI clients appear); PAR/JAR; DPoP/mTLS sender-constrained tokens (only with threat justification); multi-region data residency activation (D-7 groundwork already in place); policy simulation/versioning.

---

## Cross-cutting testing requirements (apply from M1)

Per `docs/architecture.md` and the review: unit (validation, token codec, PKCE, argon2 params), integration (real PG/Redis), protocol conformance (M2), tenant-isolation harness (M1, CI-gated), authorization matrix (M3), token/session lifecycle + reuse detection, crypto-rotation, concurrency/race (parallel refresh, duplicate-email registration), fuzz (token/SCIM-filter/redirect-URI parsers), abuse-case (rate tiers, enumeration neutrality, lockout), load (token endpoint), chaos (Redis-down degradation), DR (restore drill). **The most dangerous currently-untested paths — the T-001/T-002 query helpers — get regression tests in M0.**

## Definition of "production-ready" (exit of M5)

Password + OIDC login, M2M, PDP, MFA, key rotation, tenant isolation, audit, rate limiting, notifications, and the SDK are all implemented, tested against real datastores, conformance-passed, hardened, and operable (readiness/shutdown/DR/runbooks). Enterprise federation/provisioning (M7+) is explicitly _not_ required for first production but is unblocked by the decisions already baked in.
