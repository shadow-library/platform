# `@shadow-library/auth` — Architecture v1.1 Task List

|                     |                                                                                                                                       |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**          | Approved for development                                                                                                              |
| **Created**         | 2026-07-25                                                                                                                            |
| **Source of truth** | `identity/identity-server/docs/architecture.md` v1.1.0 (D-15 … D-22) · `docs/sdk.md` v1.1.0 · `identity/architecture-v1.1-rollout.md` |
| **Baseline**        | v0.3.1-alpha.0                                                                                                                        |

The work required to make the 2026-07-25 identity architecture revision live in this SDK. This is a
**greenfield ecosystem**: breaking changes to configuration, exports, and cookie formats are allowed,
no compatibility shims and no migration paths are required. Tasks marked _(server first)_ depend on
the referenced identity-server task landing before they can be integration-tested; everything else is
implementable now.

## A-1 — Service-access rule TTL refresh (D-17 / server T-802) · S · Sec: High

- **Change:** rules load once at boot, so an admin **revoking** a caller has no effect until the
  target service restarts — unbounded revocation latency.
- **Fix:** re-fetch `GET /api/v1/authz/service-access` on an interval (default **300 s**, configurable
  `serviceAccess.refreshSeconds`), singleflight. A failed refresh logs at warn and **keeps the last
  good rules** (never flip to deny-all on a transient outage); a failed initial load still aborts boot.
- **DoD:** a rule removed at identity denies the caller within one interval without a restart; guard
  behaviour is unchanged during an identity outage; refresh is observable in logs.

## A-2 — Step-up redirect carries intent (D-19 / server T-801, identity-web W-1) · S · Sec: High _(server first)_

- **Change:** the step-up redirect names no beneficiary, so any application could claim the resulting
  window (the acquisition race D-19 now closes).
- **Fix:** append `client_id` and `resource` to the step-up page URL alongside `return_to`; after the
  user returns, claim `POST /api/v1/app-sessions/elevation` as today. A claim rejected for intent
  mismatch restarts the prompt rather than retrying.
- **DoD:** the redirect URL carries both parameters; the claim → prompt → retry loop handles the
  mismatch rejection; integration test against a server with T-801 enforcement on.

## A-3 — Derived configuration (D-21 / server T-807) · L · **Breaking** _(server first)_

- **Change:** every consumer restates in env vars what identity already stores (audience, redirect
  URIs, scopes, step-up URL).
- **Fix:** steady-state configuration reduces to **`AUTH_ISSUER` + `AUTH_APP_ID` + a credential**
  (`AUTH_CLIENT_ASSERTION_PATH` in-cluster, `AUTH_CLIENT_SECRET` outside). At startup resolve
  `GET /api/v1/apps/me` and discovery (`step_up_endpoint`, `app_session_endpoint`); refresh on a TTL
  (singleflight) so admin grant changes propagate without redeploys. Keep explicit code/env overrides
  as escape hatches. **Remove** `AUTH_AUDIENCE`, `AUTH_REDIRECT_URI`, `AUTH_SCOPES`, and
  `AUTH_STEP_UP_URL` as required configuration — greenfield, no fallback reading of the old vars.
- **DoD:** a reference service boots with issuer + app id + credential only; a scope granted by an
  admin is usable within one refresh interval; missing app id in production is a boot failure.

## A-4 — Unseal the login-state cookie (architecture §8.6) · S · **Breaking**

- **Change:** the transient login-state cookie (state, PKCE verifier, `return_to`) is sealed with
  `AUTH_SESSION_SECRET`, or held in a single-instance in-memory store without it.
- **Fix:** replace both with a plain `__Host-`-prefixed, `HttpOnly`, `Secure`, `SameSite=Lax`,
  single-use, short-lived cookie. The prefix is what defeats login-CSRF by cookie injection, and a
  leaked verifier is inert because redemption requires the app's own M2M credential. Delete
  `AUTH_SESSION_SECRET` and the in-memory store entirely (with them, the multi-replica caveat).
- **DoD:** login round-trip works with no secret configured across multiple replicas; cookie is
  cleared on first use; login-CSRF test (foreign state) still fails closed.

## A-5 — Token-exchange helper (D-22 / server T-806) · M · Sec: High _(server first)_

- **Change:** no supported way to call another application _as the user_; header assertion is
  forbidden by D-22.
- **Fix:** `auth.exchangeUserToken({ subjectToken, resource, scopes? })` → RFC 8693 request to
  `POST /oauth2/token`; returns the token **and its granted scope** (the server narrows silently —
  callers must see what survived). Refuse locally, with a clear error, a subject token that already
  carries `act` (single-hop is a protocol rule; fail fast client-side). No caching — the token is
  per-user, short-lived, and `exp`-capped by its subject.
- **DoD:** exchange round-trip against a T-806 server; narrowed scope surfaced; `act`-bearing input
  rejected before any network call.

## A-6 — `force` flag on catalog sync (D-15 / server T-805) · S _(server first)_

- **Fix:** `syncRoles(manifest, { force? })`; surface the server's guardrail refusal as a distinct
  error (`ROLE_SYNC_REFUSED`) so a truncated-manifest deploy fails loudly instead of looking like a
  transport error. `AuthModule.forRoot({ roles })` never passes `force` implicitly — it is a
  deliberate, call-site decision.
- **DoD:** refusal maps to the distinct error; forced sync passes the flag through; module startup
  sync stays non-forced.

## A-7 — Scope-narrowing guard on mints · S · Sec: Medium

- **Change:** app-session token minting returns **200 with whatever scope survived** filtering; a
  caller that ignores the response scope hands its API a token missing the capability it asked for.
- **Fix:** compare requested vs returned scope on every mint; log at warn on narrowing and expose the
  granted set on the result; optional `strictScopes: true` to throw instead. Cache tokens under the
  **granted** scope key, not the requested one.
- **DoD:** narrowed mint logs and surfaces the delta; strict mode throws; cache never conflates
  requested with granted.

## A-8 — Test-IdP parity · M

- **Fix:** extend `createTestIdP` to cover the new surface so consumers can test without a live
  server: `GET /api/v1/apps/me` + the new discovery keys (A-3), intent-bound elevation
  (`setSteppedUp({ clientId, resource })`, mismatch rejection — A-2), token exchange incl. `act`
  refusal and scope intersection (A-5), rule-refresh clock control (A-1), and the catalog-sync
  refusal (A-6).
- **DoD:** every A-task's behaviour is exercisable against the mock; the "a handle alone grants
  nothing" and "intent mismatch fails" properties have driver support.

## A-9 — Housekeeping · S

- Default `routes.backchannelLogout` **off** in `AuthModule` — first-party revocation is pull-based
  (identity never sends BCL to app-session clients); the route stays available for the third-party
  `RelyingParty` path.
- Scope `RelyingParty` docs/exports as third-party/external only (a Shadow app never uses it).
- README + docs updated for the A-3 configuration surface; version bump on the alpha line with the
  breaking changes called out in the changelog.
- Re-pin and re-run the identity-server integration suite against the server revision carrying
  T-801/T-805/T-806/T-807.

## Definition of live

All of A-1 … A-9 shipped; the integration suite is green against an identity-server build with M7c
complete; and one reference application (`pulse-server`) authenticates users and services end-to-end
configured with nothing but `AUTH_ISSUER`, `AUTH_APP_ID`, and its projected SA token.
