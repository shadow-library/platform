# identity-web — Development Backlog

|                     |                                                                                                                                                              |
| :------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**          | Approved for development                                                                                                                                     |
| **Created**         | 2026-07-25                                                                                                                                                   |
| **Source of truth** | `../identity-server/docs/architecture.md` v1.1.0 (D-15 … D-22), `../identity-server/docs/tasks.md` M7c, `../architecture-v1.1-rollout.md` (cross-repo order) |

The web-side work required by the 2026-07-25 identity architecture revision. This app is a pure
consumer of `identity-server`'s JSON API: every task below reacts to a server contract change and
regenerates its types from the server's OpenAPI document rather than transcribing shapes by hand.

**Greenfield rules apply:** breaking UI and route changes are allowed, superseded surfaces are
removed outright (no read-only remnants, no deprecation copy), and nothing migrates. Tasks marked
_(server first)_ need the referenced identity-server task deployed to a dev environment before they
can be completed end-to-end.

## W-1 — Step-up page carries and displays intent (D-19 / server T-801) · M · Sec: High _(server first)_

- **Change:** the step-up page performs re-auth with no notion of who benefits, so the resulting
  elevation window is claimable first-come-first-served — the acquisition race D-19 now closes.
- **Fix:** accept `client_id` and `resource` query parameters from the SDK's redirect and forward
  them in the step-up submission (`POST /me/mfa/step-up`, `POST /me/webauthn/step-up`). **Render what
  is being granted** — "Approving elevated access for _Pulse_ → _api://pulse_", resolving the client
  id to its display name — because showing the user which application gets elevated authority against
  which API is part of the security value, not decoration. A step-up reached without parameters (the
  console's own) shows the ordinary copy and opens a console-only window no application can claim.
  Tampered or unknown `client_id` values render a neutral failure, never a probe result.
- **DoD:** both parameters round-trip into both step-up endpoints; the grantee is displayed for
  app-initiated step-ups and absent for console ones; E2E covers both intents and the TOTP + passkey
  paths.

## W-2 — Regenerate API types and update callers per server wave · S (recurring)

- **Change:** T-801 (step-up bodies), T-806 (token endpoint), T-807 (`/apps/me`, discovery), and
  T-808 (policy metadata) each alter the server's OpenAPI document.
- **Fix:** after each server wave lands, regenerate types from `/dev/api-docs/openapi.json` and
  update the affected server functions, hooks, callers, fixtures, and tests. This is a recurring
  chore — budget it per server task, not once.
- **DoD:** regenerated types compile with no hand edits; affected tests updated in the same PR as the
  regeneration.

## W-3 — Application-centric operator console (D-21 / server T-807) · L _(server first)_

- **Change:** the operator console administers OAuth clients and API resources as independent
  objects, which D-21 abolishes — the application is the unit of identity.
- **Fix:** "Applications" becomes the only registration surface. Creating an application provisions
  its single client and `api://<app>` resource server-side; the application page edits public URLs
  (from which redirect URIs derive), scopes and their `is_sensitive` flags, and cross-application
  grants. The standalone client and resource CRUD pages are **removed** — greenfield, no read-only
  remnants. Service-access rule administration (`/admin/service-access`) is unchanged. Secret /
  workload-subject management moves onto the application page as its credential section.
- **DoD:** an operator onboards a new first-party application end-to-end without ever seeing
  "client" or "resource" as separate objects; no route in the app links to the removed pages.

## W-4 — Boolean inputs in the org security-policy editor (D-20 / server T-808) · S _(server first)_

- **Change:** the organisation security-policy editor renders duration policies; T-808 introduces the
  first `boolean` key (`mfa.email_otp_fallback.enabled`).
- **Fix:** the policies list response is metadata-driven — render `boolean` policies as a toggle
  alongside the duration inputs, generically from the registry metadata (no per-key UI code), and
  surface the fold-strategy hint ("any organisation disabling this wins").
- **DoD:** the new key is editable; a future boolean key renders with zero UI changes; the editor
  still round-trips duration keys unchanged.

## W-5 — Sign-out copy and affordances match the pull model (D-18) · S

- **Change:** first-party revocation is pull-based — identity sends no logout notice to app-session
  clients; applications are cut off at their next token mint.
- **Fix:** no UI element may promise instant app-side logout on global sign-out; copy states that
  other applications stop within their current token lifetime. Remove any reference to
  `/oauth2/logout` or RP-initiated logout if present — the endpoint does not exist.
- **DoD:** sign-out and session-management screens carry the corrected copy; no dead links or
  references to RP-initiated logout remain.

## W-901 — Application access control, visibility & tiering UI (server T-901…T-904) · L _(server first)_ — done

- **Change:** the server adds per-app visibility (`PUBLIC`/`RESTRICTED`/`INTERNAL`), per-org app
  assignment with an `appAccessMode` (`ALL_APPS`/`ASSIGNED_ONLY`), org-wide role grants
  (`principalType: ORGANISATION`), and turns `GET /me/applications` into all **accessible** apps.
- **Fix:**
  - **Denied page** — `/error?error=access_denied&application=&client_id=` now names the app and
    explains "your organization hasn't given you access to <app>; contact your admin" (D-A3); the
    generic variant is preserved when unnamed.
  - **Console** — application detail gains a step-up-gated visibility selector, a header/list
    visibility badge, and an "Organisations" tab (RESTRICTED only) to release/revoke orgs; roles gains
    an *Organisation* principal type (id = org id) rendered sensibly in the assignments list.
  - **Org workspace** — new admin-gated "Applications" tab: OWNER-only access-mode toggle (step-up)
    with each mode explained, and per-app assign/unassign switches (ADMIN, step-up) with visibility
    badges and empty/edge states, gated via `orgAccessOf`.
  - **My applications** — consumes the extended payload: all accessible apps, "Never used" for
    accessible-but-unused apps, `homePageUrl` preferred for the outbound link, `logoUrl` on the avatar.
  - New API wrappers in `src/lib/apis/` (`organisation-application.api.ts` + admin-application release
    endpoints) following the house server-fn + queryOptions + hooks + `*Keys` invalidation pattern,
    typed off the regenerated `api-types.gen.ts`.
- **DoD:** `bun run verify` passes; Playwright suite green (added `tests/error.spec.ts` for the denied
  page render); API types regenerated from the running server's OpenAPI.

## Cross-cutting

- Verify with `bun run verify` and the Playwright suite from inside this repo; W-1 and W-3 need a dev
  `identity-server` running the corresponding M7c tasks.
- Coordinate merges with the waves in `../architecture-v1.1-rollout.md` — in particular, W-1 must be
  live before the server enforces T-801 intent matching, or every application step-up breaks.
