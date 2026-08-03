# Shadow Library — End-to-End Tested Flows

This document catalogs every flow exercised by the whole-platform Playwright suite in `e2e/`. The suite
runs against the already-deployed dev cluster (`*.shadow-apps.test`); a Playwright global-setup step seeds
the databases first (see [Seed data](#seed-data)) and a `setup` project mints per-persona sessions before
the product specs run.

Test kinds: **UI** drives the browser; **API** drives the JSON API through Playwright's request context
(with the CSRF double-submit dance for authenticated mutations); **DB** asserts against Postgres directly
(the seed/outbox/notification tables) to prove server-to-server and async effects.

Suite size: ~155 product tests across five areas (identity, web-novel, pulse, novel-forge, cross-app) plus the
retained smoke specs. AI-dependent Novel Forge tests self-skip when the CLI-gateway key is not configured;
a handful of identity flows self-skip when the per-IP auth rate limit is hot (see the known-gaps section of
`BUGS-FOUND-AND-FIXED.md`). All non-skipped tests pass against the redeployed cluster.

## Personas & seed data

Seeded idempotently on every run by `e2e/seed/seed.ts` (Bun + argon2id password hashing), wired into
Playwright `globalSetup`.

| Persona   | Identity                         | Role / state                                                                       | Sessions minted        |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------- | ---------------------- |
| user1     | `e2e.user1@shadow-apps.test`     | ordinary reader; holds a RESTRICTED-novel grant, a library entry, reading progress | novel-forge, web-novel |
| user2     | `e2e.user2@shadow-apps.test`     | ordinary reader; used for wrong-user / isolation negatives                         | novel-forge, web-novel |
| admin     | `admin@shadow-apps.com`          | platform admin (IAMAdmin + PulseAdmin)                                             | identity, pulse        |
| locked    | `e2e.locked@shadow-apps.test`    | `lockMode=FULL`, `lockedUntil` in the future                                       | —                      |
| suspended | `e2e.suspended@shadow-apps.test` | `status=SUSPENDED`                                                                 | —                      |

Seeded content:

- **web-novel**: `e2e-public-novel` (PUBLIC, live, 3 chapters, 2 wiki entries — one visible from ch1, one
  spoiler-gated at ch2 with a facet gated at ch3), `e2e-restricted-novel` (RESTRICTED, 2 chapters, grant to
  user1 only); user1 library + reading-progress rows.
- **pulse**: `e2e-dev` sender profile with DEV-provider EMAIL & SMS endpoints and a catch-all routing rule
  (so notification sends actually deliver in dev).
- **identity**: the five personas above with verified primary emails.

Ordinary users are deliberately **denied a Pulse session** — Pulse is an INTERNAL console; identity refuses
the OIDC hop for a non-privileged user. That denial is itself asserted (see Cross-app security).

## Identity (`tests/identity/`)

**Registration (UI, happy + error)**

- Full 4-step signup: email → OTP (read from `notification_outbox`) → profile → password → signed-in landing.
- Weak password rejected at the password step.
- Duplicate email stays enumeration-safe (identical path to a new email; no "already exists" leak).

**Login (UI, happy + error)**

- Sign in via `/login`, land in the account portal, `isLoggedIn` cookie set; sign out clears the session and
  protected routes redirect to `/login`.
- Wrong password → error surfaced, attempts decrement, no session.
- Suspended account → 403 (`AUTH_010`) at the identifier step, never prompts for a password.
- **FULL-locked account → login refused (`AUTH_012`), no session** (regression test for a fixed security bug).
- OTP_ONLY lock → password refused but OTP still completes (unchanged behavior guarded).

**Account management (UI + API)**

- View overview/profile; update first/last name and confirm persistence.
- List active sessions with the current-device marker.
- Change password: wrong current password → error; successful change enqueues an `auth.password.changed`
  notification outbox row (asserted in the identity DB).

**API error paths**

- Stale/unknown flow → 410 `AUTH_001`.
- `/oauth2/token` with a JSON body → 400 `invalid_request`; with bogus client creds (form) → 401 `invalid_client`.
- `/oauth2/userinfo` with missing/garbage bearer → 401.
- CSRF: session mutation without / with a mismatched `x-csrf-token` → rejected (session survives).

**Security**

- Unauthenticated `/account`, `/account/security`, `/console` → redirect to `/login`.
- Non-admin (user2) `GET /api/v1/admin/users` → 403 `ADM_001`; `/console` shows no user directory.
- Admin search (`GET /api/v1/admin/users`) → 200 (positive control).
- Open redirect: `/login?returnTo=https://evil.example.com` does not navigate off-origin.

## Web Novel (`tests/web-novel/`)

**Guest reading (UI)**

- Home renders novel cards including the public novel; detail page shows title + 3-chapter list; read chapter 1
  and navigate to chapter 2; browse lists and searches the public novel.
- Restricted novel absent from the guest catalog/home; guest visit → 404 boundary (not a "forbidden" page);
  unknown slug → 404 boundary.

**Catalog API**

- `GET /api/novels` returns the public novel, never the restricted one; pagination and `sortBy=title` work.
- Validation 400/422: `limit=0`, `limit=101`, `offset=-1`, `sortBy=bogus`, bad slug pattern.
- Unknown valid slug → 404 `WBN_001`; unknown chapter ordinal → 404 `WBN_002`.
- ETag: fetch chapter 1, re-request with `If-None-Match` → 304.
- Cache-control: `public, max-age` on the public catalog vs `private, no-store` when authenticated.

**Visibility security**

- Restricted novel: guest and user2 (no grant) → 404 `WBN_001`, **byte-identical to the unknown-slug 404**
  (enumeration safety); user1 (granted) → 200; appears in user1's `/api/shared`, never in user2's; chapters
  gated identically.

**Reader features (API + UI)**

- Progress: seeded ordinal read back; monotonic `furthestOrdinal` on PUT; progress for a never-opened novel →
  404 `WBN_006`; unauthenticated PUT → 401.
- Library: user1 list contains the public novel; user2 add → list → remove (idempotent second delete);
  adding the restricted novel as user2 → 404 `WBN_001`.
- UI: user1's `/library` shows the seeded item; guest `/library` → redirect to `/login?returnTo=/library`
  (regression test for a fixed library-render bug).

**Wiki gating**

- Guest sees only the ch1-visible entry with `lockedCount ≥ 1`; the spoiler entry → 404 `WBN_009`.
- user1 (progressed past the gate) sees the locked entry with `hiddenFacetCount ≥ 1`; a nonexistent entryKey
  returns the same 404 shape (enumeration safety).

**UI polish**

- `/login?returnTo=//evil.example.com` and `https://evil.com` are dropped (open-redirect guard).
- Reading-settings drawer and theme toggle work.
- Novel detail page returns HTTP 404 (not 500) for a missing/restricted novel (regression test for a fixed bug).

## Pulse (`tests/pulse/`)

**Console UI (admin)**

- Dashboard shape (KPI cards; values are mock data by design); template list + search; create/edit a template;
  sender-profile list shows `e2e-dev`; create + delete an own profile; routing list shows the catch-all rule;
  nav / theme toggle / sign-out present.

**Template lifecycle (API)**

- Create → duplicate key 409 `TPL_002`; open draft → **second draft 409 `TPL_PUB_004`** (regression test);
  publish with declared variables; publish with no draft → `TPL_PUB_001`; undeclared variable → `TPL_PUB_003`;
  preview; rollback.

**Send + delivery (API + UI) — the identity-catalog delivery contract**

- `POST /api/v1/notifications` for a seeded template → 201 ACCEPTED, EMAIL QUEUED; poll the pulse DB until the
  `notification_jobs` row is SENT (DEV provider) and a `notification_messages` row holds the rendered body.
- Unknown template → failure; empty recipients → 422; invalid email → per-channel `NTF_002`; payload violating
  the variable schema → `NTF_004`.
- `/send` UI form submits and shows an "Accepted" result.

**Sender / routing API**

- Profile + endpoint CRUD; duplicate endpoint → 409 `SND_EP_002`; routing-rule create/duplicate → 409
  `SND_RTR_002`; rule against an inactive profile → `SND_RTR_003`; delete a profile still referenced by a rule
  → `SND_PRF_003`; **routing-rule responses now carry their `id`** (regression test); non-numeric id → 422.

**Security**

- No token → 401 `IAM_001`; guest browser → `/login` redirect.
- Admin `POST /api/v1/notifications` → 403 `IAM_002` (service-scope only, no human role can call it).
- Dev-only `GET /api/v1/notifications/messages` → 200 for admin.

## Novel Forge (`tests/novel-forge/`)

**Project CRUD + settings (API + UI)**

- Create (kind `new_novel`, `contentMode=standard`); list; status/cost endpoints; PATCH title/brief persists;
  PATCH per-role model config → round-trips; clone → distinct id; delete clone → 404 `PRJ_001`.
- UI: dashboard card; "Start a new novel" modal → workspace overview with the lifecycle stepper.

**Ownership security**

- user2 GET/PATCH/DELETE user1's project → **404 `PRJ_001`** (never 403 — BOLA non-disclosure).
- Unauthenticated `GET /api/v1/projects` → 401; guest workspace visit → `/login`.
- `contentMode=grok_only` accepts but ignores an anthropic override (documented coercion).

**Import → publish → cross-app arrival (API + DB, no AI)**

- Import a hand-authored `final`-mode bundle → chapters land; publish metadata + chapters (202).
- Poll the publication ledger, then verify **web-novel arrival**: `GET web-novel /api/novels/<slug>` → 200 with
  the title and chapter ordinals (regression test for the fixed forge→web-novel push).
- RESTRICTED access: grant user2 by email → user2 can read on web-novel, guest 404 → reopen to PUBLIC.
- Non-contiguous publish → `PUB_003`; absent/unfinalized chapter → `PUB_002`/`CHP_001`; reconcile reports
  coherently; garbage import bundle → 422; empty-project export → `EXP_001`.

**AI pipeline with Claude Haiku (API + DB, gated)**

- Every AI test pins Claude Haiku per-role and is gated behind an `aiAvailable()` probe (self-skips when the
  gateway key is absent). When enabled: seed-from-brief → plan → approve → outline → generate → judge → approve
  → finalize, asserting every `model_calls` row used `anthropic`/`claude-haiku-4-5`.
- Chat: create a session, post a message, get an assistant reply; archived session → `CHT_002`.

## Cross-app (`tests/cross-app/`)

**SSO**

- One credential prompt at identity → Novel Forge and Web Novel both land signed-in via the OIDC hop with no
  re-prompt; identity signout re-prompts the identity portal.
- Logout semantics recorded: consumer app sessions are independent opaque sessions and survive identity
  signout (no back-channel logout wired) — asserted as the platform's real model.

**Identity → Pulse notification pipeline (DB)**

- Trigger a real identity action (password change) → assert the `notification_outbox` row → poll until the
  worker flips it SENT → poll the pulse DB for the rendered message to the recipient. Proves the full chain:
  identity worker self-signs a service token, M2M-authenticates to pulse, pulse routes via the seeded rule to
  the DEV endpoint (regression test for the fixed empty-template-catalog bug).

**Internal-API / service-boundary security**

- web-novel `/internal/*` not routed on the public edge (SPA 404 shell); a user-kind session cannot reach it.
- pulse `POST /api/v1/notifications` with no token → 401 `IAM_001`.
- identity admin API with a plain user → 403 `ADM_001` across reads and a mutation, no data leakage.
- Health `/health/ready` / `/health/live` not exposed with the internal contract on any public origin.
- CSRF on web-novel `POST /api/library`: missing / mismatched token → rejected; correct double-submit → 204.
- Session-cookie isolation: a web-novel `__Host-shadow-session` presented to novel-forge → 401 (opaque handles
  are not portable across origins).

**Cross-user data isolation**

- user2's progress and library never contain user1's grant-gated novel; novel-forge project lists are strictly
  owner-scoped and disjoint between users.

**Organisation access & ORGANISATION visibility** (`cross-app/org-access-and-visibility.spec.ts`)

- Register a brand-new user end-to-end (init → OTP from outbox → profile → password → live `__Host-sid` session).
- Create an organisation (creator becomes OWNER); invite a member (`organisation-invitation` token read from the
  outbox) and accept it (`POST /api/v1/me/invitations/accept`) — DB confirms the ACTIVE MEMBER row.
- **Pulse denial**: the new non-staff user's SSO hop to Pulse (an INTERNAL app) is refused at
  `/oauth2/authorize` (401) and yields no Pulse session; the PulseAdmin persona keeps one (positive control).
- **ORGANISATION-visibility novel**: an accepted org member reads it (200) through web-novel's real internal
  membership call to identity; a non-member and a guest get a byte-identical 404 `WBN_001`, and it never appears
  in the PUBLIC catalog. RESTRICTED gate re-confirmed (granted user 200, others 404).

**Novel Forge → Web Novel authoring, publishing & wiki** (`novel-forge/wiki-publish.spec.ts`)

- Import a novel bundle (no AI), author wiki via the bible API (entities + revealed canon facts), publish, and
  reconcile — the wiki projection is pushed to the reader in the same converge as chapters.
- On the reader: the novel and chapters arrive (200); the wiki index lists the visible entry and hides the
  spoiler-gated one (`lockedCount ≥ 1`); the visible entry returns facets; the gated entry is 404 `WBN_009` for a
  guest and becomes visible once reading progress passes its gate (gating reflects `furthestOrdinal`).

**Session expiry while the app is loaded** (`cross-app/session-expiry.spec.ts`)

- With the app open and hydrated, the session is expired (all cookies cleared, incl. identity's `__Host-sid`),
  then the user acts. Novel Forge, Pulse, and the Identity portal run the shared in-shell `useSessionGuard`, so a
  client-side navigation after expiry bounces to login (no error shell, no reload needed). Web Novel is
  offline-first by design — `/library`/`/history` keep rendering device-local data on expiry and recover to
  login on a full reload (asserted as the intended behavior).

## Pre-existing smoke specs (`tests/*.spec.ts`)

`auth-gate`, `authenticated-placeholder`, `health-not-exposed`, `public-reading`, `ssr-hydration`,
`web-reachability` — retained; the new suites build on their conventions.
