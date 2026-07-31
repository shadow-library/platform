# Application access control, visibility & customer tiering — implementation spec

|                  |                                        |
| :--------------- | :------------------------------------- |
| **Status**       | Approved for development               |
| **Version**      | 1.0.0                                  |
| **Last updated** | 2026-07-26                             |
| **Tasks**        | T-901 · T-902 · T-903 · T-904 · W-901  |

Three orthogonal concepts. Do not collapse them:

1. **Visibility** (platform admin, per application) — who *could ever* be granted the app: `PUBLIC` (generally available), `RESTRICTED` (only organisations the platform admin released it to), `INTERNAL` (platform-org staff only).
2. **Assignment** (org admin, per organisation) — which visible apps the org's members actually get. Org mode `ALL_APPS` (open) or `ASSIGNED_ONLY` (managed allowlist).
3. **Capability** (roles → permissions via the PDP) — feature gating once inside the app. Premium tiers live here, never in the sign-in gate.

## Recorded decisions

- **D-A1 — Union rule.** A user may access an app iff **at least one** of their ACTIVE org memberships grants it. The personal workspace grants exactly the `PUBLIC` apps. An org never restricts what another org (or the personal workspace) grants — except D-A2.
- **D-A2 — Managed-account override.** For users with any `scim_directory.managed = true` row, only the managing organisation(s)' grants apply, account-wide (the personal workspace grants nothing). The account exists because the tenant created it; the tenant owns it. Adopted accounts (`managed = false`) are untouched.
- **D-A3 — INTERNAL is hidden.** A non-platform user hitting an `INTERNAL` app's client is answered exactly as an unknown/inactive client (`OAU_002` at authorize; no denied page, no redirect). `RESTRICTED`/`PUBLIC` denials say "access denied" openly (a refused customer is a sales lead, not a leak).
- **D-A4 — Hard cut.** Unassignment takes effect at next token mint/refresh — no grace window. Existing app sessions are revoked on the failing mint.
- **D-A5 — Premium grants are vendor-controlled.** Org-wide role grants (`ORGANISATION` principal) are administered only through the platform admin API (two-tier `requireRoleAdmin`), never by org admins. Org admins manage *who gets the app*; the vendor manages *what tier the org bought*.
- **D-A6 — Default roles are implicit.** `application_roles.is_default` roles are unioned into every PDP resolution for that application's permissions; no `role_assignments` rows are materialised for baseline users.
- **D-A7 — Sign-in gate keys on `application_id`**, resolved from `oauth_clients.application_id`. One app, many clients — the check must not key on client id. `client_credentials` (M2M) is exempt: no user, no org; `service_route_access` already governs it.
- **D-A10 — Active organisation comes from reachability.** A user token's `org` claim is one of the organisations that actually **grant** the application, never the personal workspace by default. Access is a union across orgs (D-A1) but capability is evaluated in exactly one, so pinning sessions to the personal workspace made a role granted in a team organisation unreachable — `INTERNAL` and `ASSIGNED_ONLY` apps were 403 for everyone. Preference: the `organisation_members.is_default` membership if it grants, else the personal workspace if it grants, else the lowest-numbered candidate. For a `PUBLIC` app this is exactly the old behaviour.
- **D-A11 — Switching organisation rotates the session handle.** Applications cache minted tokens against the app-session handle, so a switch served by one replica cannot reach a sibling's cache; the previous organisation's authority would stay live for the token's remaining lifetime. Retiring the handle makes those entries unreachable everywhere at once, and matches the rule that a session identifier rotates whenever the context it authorises changes. Adding `org` to the client-side cache key does **not** work: the lookup id is built before the mint, when the organisation is still unknown.
- **D-A12 — A stale active organisation realigns, it does not revoke.** If a session's organisation stops granting the app while another still does, the next mint re-points the session rather than ending it — access itself holds, so revoking would be gratuitous. When *no* organisation grants, D-A4's hard cut still applies first. This is also what converges sessions opened before D-A10 existed, so no session data migration is needed.

## Schema (T-901, all additive)

```
application_visibility enum: PUBLIC | RESTRICTED | INTERNAL
applications.visibility            NOT NULL DEFAULT 'PUBLIC'

organisation_application_source enum: PLATFORM_RELEASE | ORG_ASSIGNMENT
organisation_applications (
  organisation_id  bigint  FK -> organisations  ON DELETE CASCADE,
  application_id   int     FK -> applications   ON DELETE CASCADE,
  source           organisation_application_source NOT NULL,
  assigned_by      varchar(64),                 -- actor user id, audit attribution
  assigned_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, application_id, source)
)  + index on (application_id)

organisation_app_access_mode enum: ALL_APPS | ASSIGNED_ONLY
organisations.app_access_mode      NOT NULL DEFAULT 'ALL_APPS'

application_roles.is_default       bool NOT NULL DEFAULT false

principal_type enum += 'ORGANISATION'           -- role_assignments; principal_id = org id (as string)
```

`app_access_mode` is deliberately a **column**, not an `organisation_policies` key — the policy registry folds values across all applicable orgs (MIN/AND); this setting is read for one specific org and never folded.

Migration via `bun run db:generate`; `bun run check-migrations` must be clean; the test template DB must rebuild.

## Access resolution (T-901 — `ApplicationAccessService`, `src/modules/system/application/`)

```
resolveAccessibleApplicationIds(userId):
  memberships = organisation_members of user where member status resolves ACTIVE
                and organisation.status = ACTIVE
  managedOrgIds = scim_directory rows for user where managed = true
  if managedOrgIds not empty: memberships = memberships ∩ managedOrgIds     # D-A2
  grants = ∅
  for each membership m (org o):
    if o.type == PERSONAL:
      grants += { active apps with visibility PUBLIC }
    else:
      base = { active apps with visibility PUBLIC }
      if o is the platform org ('Shadow Platform'): base += { visibility INTERNAL }
      base += { visibility RESTRICTED with a PLATFORM_RELEASE row for o }
      if o.app_access_mode == ALL_APPS: grants += base
      else: grants += base ∩ { apps with an ORG_ASSIGNMENT row for o }
  return grants
```

`assertUserAccess(userId, applicationId)` distinguishes two denials:

- **hidden** — app inactive, or `INTERNAL` and no qualifying platform membership → caller treats as unknown application (D-A3);
- **denied** — visible but not granted → access-denied semantics.

**Caching:** cache the per-organisation grant set (mode + assignments + releases + visibility layer) in Redis with explicit invalidation on any mutating admin/org operation (assignment, release, mode change, visibility change, app activate/deactivate), following the existing `authz_version` bump pattern in `PolicyDecisionService`. Membership + `scim_directory` lookups stay fresh per request (indexed point queries). New `AppErrorCode` entries follow the existing `APP_0xx` catalog.

## Enforcement points (T-902)

| Path | Behaviour on deny |
| --- | --- |
| `OAuthService.authorize` — immediately **after** `sessionService.validate` succeeds, before the consent branch | *hidden* → `OAU_002` (as unknown client). *denied*, first-party client → 302 to identity-web's existing hosted error page: `new URL('/error', <origin of oauth.login-url>)` with query `error=access_denied&application=<displayName>&client_id=<id>`. *denied*, third-party → `redirect_uri?error=access_denied&state=...` (RFC 6749), mirroring `ConsentService.decide`. Always audit `oauth.authorize.denied`. |
| App-session token mint (`/api/v1/app-sessions/*`) | Re-check on **every** mint (this is the revocation story — back-channel logout never reaches app-session clients). Deny → revoke the app session, answer `AUTH_005` 401 so the SDK restarts login. |
| `refresh_token` grant at `/oauth2/token` | Deny → revoke the refresh-token family, RFC error `invalid_grant`. |
| Token exchange (RFC 8693) | Check the **subject user's** access to the target audience's owning application; deny → `invalid_target`. |
| SAML SP-initiated SSO | Add nullable `saml_service_providers.application_id` (FK → applications, SET NULL); when linked, run the same check before issuing the assertion (deny → SAML error status / hosted denied page for the browser); unlinked SPs keep today's behaviour. |
| `client_credentials` | Exempt (D-A7). |

## API surface (T-903)

| Actor | Endpoint | Auth |
| --- | --- | --- |
| Platform admin | `PATCH /api/v1/admin/applications/:applicationId` — accepts `visibility` | `appsManage` + elevated (extend existing) |
| Platform admin | `GET /api/v1/admin/applications/:applicationId/organisations` — releases + assignments overview | `appsRead` |
| Platform admin | `POST /api/v1/admin/applications/:applicationId/organisations` / `DELETE .../organisations/:organisationId` — release / revoke a RESTRICTED app for an org (`source = PLATFORM_RELEASE`) | `appsManage` + elevated |
| Org admin | `GET /api/v1/organisations/:organisationId/applications` — available + assigned | `orgRole: ADMIN` |
| Org admin | `POST /api/v1/organisations/:organisationId/applications` / `DELETE .../applications/:applicationId` — assign / unassign (`source = ORG_ASSIGNMENT`) | `orgRole: ADMIN` + elevated |
| Org owner | `PATCH /api/v1/organisations/:organisationId` — accepts `appAccessMode` | `orgRole: OWNER` + elevated |
| Platform/app admin | `POST /api/v1/admin/role-assignments` (+ revoke) — accepts `principalType: ORGANISATION` | existing `requireRoleAdmin` + elevated (T-904) |
| Application (M2M) | `POST /api/v1/app-sessions/organisations` `{ sessionHandle }` — the organisations this session may act in, active one flagged (D-A10) | service token + `app-session:manage` |
| Application (M2M) | `POST /api/v1/app-sessions/organisation` `{ sessionHandle, organisationId }` — switch, answering a **rotated** handle (D-A11); a non-granting target is `APP_007` | service token + `app-session:manage` |
| End user | `GET /api/v1/me/applications` — launcher: a "my applications" surface already exists (backed by `application_members`, i.e. apps *used*); extend it to return all **accessible** apps (per `ApplicationAccessService`) enriched with first/last-used where present, and excluding apps the user can no longer access | `session: true` (existing route — check and extend, don't duplicate) |

Rules: an org can only assign apps its members could actually reach (assigning an unreleased RESTRICTED or INTERNAL app is `ORG_`-catalog validation error); releasing to an unknown org / assigning an unknown app answers the existing uniform not-found codes. All mutations audit: `application.visibility.changed`, `application.release.granted|revoked`, `org.application.assigned|unassigned`, `org.app_access_mode.changed` (align naming with the existing audit action catalog). Response DTOs follow `@RespondFor`; IDs use existing conventions.

## Tiering (T-904)

- Catalog manifest (`PUT /api/v1/authz/catalog`) gains optional `default: boolean` per role → persisted to `application_roles.is_default` in `CatalogSyncService.sync`.
- `PolicyDecisionService.resolvePermissions` unions three sources: explicit user/service assignments (as today) + `ORGANISATION`-principal assignments for every org the user is an ACTIVE member of (org itself must be ACTIVE) + `is_default` roles of the application in scope. Deny-by-default preserved; app-scoped variants (`checkForApplication`) keep the application filter.
- `ORGANISATION` assignments: `principal_id` = org id, `organisation_id` = same org id; validated on assign (org exists, ACTIVE). `requireRoleAdmin` authorization unchanged.
- **Invalidation:** an org-wide grant change must NOT enumerate members. Add a per-org version component (`authz_version:org:{id}`); the `authzVersion` returned by `check` becomes principal version + applicable org versions (sum), so enforcement-point caches (SDK caches decisions 60 s keyed on version) converge within one cache TTL.
- Ending a membership already revokes org-scoped user assignments; `ORGANISATION` grants naturally stop applying when membership ends — add a regression test.

## identity-web (W-901, `../identity-web`)

1. Regenerate API types from this server's OpenAPI (repo's `generate:api-types` flow; needs the server running locally).
2. **Denied page** — extend the existing hosted error page (`src/routes/_auth/error.tsx`, `access_denied` variant) to read the new `application` + `client_id` query params and explain "your organisation hasn't given you access to <app>". This is the landing target of the authorize deny redirect.
3. **Admin console**: visibility selector on the application detail page; "Organisations" tab on a RESTRICTED app to release/revoke orgs; role-assignment form gains an *Organisation* principal type.
4. **Org settings**: "Applications" tab — access-mode toggle (owner-only affordance, AAL2 step-up flows already exist) and assign/unassign list.
5. **"My Apps" launcher** page over `GET /api/v1/me/applications` (name, logo, home page URL, last used).
6. Follow that repo's own conventions (its CLAUDE.md, `@shadow-library/ui` components, `--sh-*` tokens); `bun run verify` there must pass.

## SCIM group → role mapping (T-905)

Scope: directory group membership drives **capability** (org-scoped user role assignments), never app
*access* — access stays org-level by design (`ASSIGNED_ONLY` governs the org; groups govern what members
may do inside an app). Recorded decisions:

- **D-A8 — Vendor-controlled mappings.** Creating/deleting a mapping rides the existing two-tier
  `requireRoleAdmin` (+ AAL2) — never org admins. A mapping is how a sold tier reaches a tenant's
  directory structure; letting org admins map groups onto roles would bypass D-A5.
- **D-A9 — Provenance by marker, not schema.** Derived assignments are ordinary `role_assignments`
  rows with `granted_by = 'scim:group:<groupId>'`. Sync revokes only rows carrying the group's marker,
  so manual grants are never touched and no schema change is needed.

Model: `scim_group_role_mappings` (id uuid PK; `group_id` uuid FK → scim_groups CASCADE; `role_id` int
FK → application_roles CASCADE; `created_by`; `created_at`; unique(group_id, role_id)).

Semantics: mapping create backfills all current group members (assign mapped role, org = the group's
org); membership add assigns; membership remove/group delete/mapping delete revokes the marker rows —
except when another mapped group in the same org still grants the same role (overlap check). Directory
deprovision needs no new work: membership end already revokes org-scoped assignments. Every sync
invalidates affected principals (`invalidatePrincipal`); bounded by group size, which is fine for
explicit membership operations. Validation on create: group exists; the role's application is reachable
by the group's organisation (same reachability rule as `ORG_011`).

API (admin tier): `GET /api/v1/admin/scim/group-mappings?organisationId=&groupId=` ·
`POST /api/v1/admin/scim/group-mappings` `{ groupId, roleId }` · `DELETE /api/v1/admin/scim/group-mappings/:mappingId`
(reads `rolesManage`; mutations `requireRoleAdmin`-scoped + elevated, mirroring role assignment).

## Testing (each task lands its own specs)

- Resolution matrix: personal-org user × PUBLIC/RESTRICTED/INTERNAL; ASSIGNED_ONLY with/without assignment; RESTRICTED needing release **and** assignment; platform member × INTERNAL; managed user locked to owning org (D-A2); suspended membership/org grants nothing.
- Authorize: denied user gets the redirect contract (first- vs third-party); INTERNAL reads as unknown client; granted user unaffected.
- Revocation: unassign → next mint revokes the app session (`AUTH_005`); refresh denied with family revoked.
- Tiering: fresh user has baseline permissions with zero assignment rows; org-wide grant flips PERMIT for all members and bumps the returned version; revocation propagates; membership end drops org-granted permissions.
- Migration drift clean; coverage threshold (0.9) holds.
