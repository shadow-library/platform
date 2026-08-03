# Bugs Found & Fixed — E2E Hardening Pass

Every defect surfaced while building and running the whole-platform e2e suite, with root cause and fix.
All fixes are in the working tree and were deployed to the dev cluster via `gitops build` + `gitops apply dev`.

Legend: **security** = authz/authn correctness · **interconnect** = server-to-server · **correctness** = wrong
result · **config** = deployment wiring.

## Fixed

### 1. FULL account lock not enforced on login — `identity-server` (security)

A user with `lockMode = 'FULL'` could still complete an interactive login and receive a session: the flow only
gated `OTP_ONLY` locks (`isOtpLocked`), never `FULL`. Verified live — the FULL-locked persona logged in and got
`__Host-sid`.
**Fix**: added `AUTH_012` (403, "Account is locked") and an `isFullyLocked` helper; gated it at flow `init()`
(rejects every identifier-based method before a flow exists) and at `complete()` — the sole session-minting
chokepoint, which also closes the usernameless-passkey and federated-subject-mismatch paths. `OTP_ONLY` behavior
unchanged. New tests cover password refusal, mid-flow lock at completion, lock expiry, and OTP_ONLY.
Files: `apps/identity-server/src/modules/auth/flow/login.service.ts`, `.../classes/app-error-code.ts`.

### 2. Identity → Pulse notifications completely broken in deployment — `pulse-server` (interconnect)

Every identity notification dispatch (OTP, password-changed, new-sign-in) died with 404 `TPL_001`: pulse's
`templates`/`layouts`/`partials` tables were **empty in the deployed cluster**. The baseline seed
(`seed()`, documented "safe to run in production") was only ever called from the test harness — the deployed
migrate job ran Drizzle migrations and nothing else. Identity's outbox rows retried to `FAILED`/`DEAD`.
**Fix**: relocated the production baseline (layouts, partials, the identity `auth.*`/`security.*` template
catalog) from `tests/fixtures/` into `src/database/seed/`, and call `seedBaseline()` from `migrate.ts` after
migration. Idempotent (overwritable-baseline contract); operator-configured senders are deliberately not seeded.
Confirmed post-deploy: the migrate job logged "Baseline seeding completed successfully" and the catalog is
populated (8 identity templates, 27 published versions).
Files: `apps/pulse-server/src/database/seed/*`, `.../src/migrate.ts`.

### 3. Forge → Web-Novel publish push dead — `devops` config (interconnect)

Publishing a novel from Novel Forge never reached the reader platform: the reader-push client resolved
`web-novel-server` to a bare `http://web-novel-server`, which does not resolve from the `novel-forge` namespace
(the service lives in `web-novel`). Every push failed with a transport error → `PUB_004`, chapters stuck
`failed`.
**Fix**: set `SERVICE_URL_WEB_NOVEL_SERVER: http://web-novel-server.web-novel` in novel-forge's dev values
(mirroring how identity addresses pulse at `pulse-server.pulse`). Confirmed present in the deployed
`novel-forge-server-config` ConfigMap.
File: `devops/applications/novel-forge/server/values-dev.yaml`.

### 4. Query-string validation silently bypassed platform-wide — `packages/fastify` (correctness/security)

`?limit=0`, `?limit=101`, `?limit=abc`, `?offset=-1`, `?sortBy=bogus` all returned 200 with defaults silently
substituted, despite the DTO's `minimum`/`maximum`/enum constraints — while `@Params()`/`@Body()` validated
correctly. The validator compiler's querystring branch deliberately swallowed every AJV error and back-filled
defaults. This affected every server built on the shared HTTP core.
**Fix**: unified the querystring branch with params/body in `compileValidator` — invalid query params now return
the platform's standard 422 `VALIDATION_ERROR`; valid values still coerce (`"20"` → `20`). Verified no deployed
frontend sends out-of-range query values (catalog `limit` 20, chapters/templates `limit` 100 = inclusive max).
File: `packages/fastify/src/module/fastify.utils.ts`.

### 5. Notification outbox stored double-encoded JSON — `identity-server` (correctness/interconnect)

`notification_outbox.recipients` / `payload` were written as quoted JSON **string** scalars
(`jsonb_typeof = 'string'`), so `recipients->>'email'` returned NULL for any external consumer. Root cause:
Drizzle's stock `jsonb` `JSON.stringify`s, then the `bun-sql` driver JSON-encoded that string again.
**Fix**: a `jsonbObject` custom column type (pass-through to/from driver) on both columns — the driver now
encodes exactly once. No DDL change (`dataType` stays `jsonb`; `check-migrations` clean). The in-app ORM reader
was symmetric and unaffected.
File: `apps/identity-server/src/modules/infrastructure/datastore/schemas/notification.schema.ts`.

### 6. Novel detail page returned 500 instead of 404 — `web-novel-web` (correctness/security)

`/novels/$slug` for a missing or restricted novel threw the API's 404 into the generic catch boundary, yielding
an outer HTTP 500 — and weakening enumeration safety at the page layer. The wiki index and wiki-entry routes had
the same latent bug.
**Fix**: the loaders now map an API 404 to TanStack Router's `notFound()` (matching the novel-forge-web idiom);
real 5xx still surface as errors. All three routes fixed.
Files: `apps/web-novel-web/src/routes/_shell/novels.$slug.tsx` and the two wiki routes.

### 7. Library screen showed "0 saved novels" for users with a library — `web-novel-web` (correctness)

The library query used a static React Query key (`['library']`, no user dimension) and ran before the session
resolved, caching the empty guest result permanently. The API was correct; only the screen was wrong.
**Fix**: key the query by user id (`['library', userId]`), matching the app's existing notifications-key idiom.
The identical bug in `progress.api.ts` (reading-progress, same screens) was fixed the same way.
Files: `apps/web-novel-web/src/lib/apis/{library,progress}.api.ts` + progress call sites.

### 8. `TPL_PUB_004` never thrown — `pulse-server` (correctness)

Opening a second template draft silently returned the existing one instead of the declared conflict error.
**Fix**: split `openDraft` into a private idempotent `ensureDraft` (used internally by content upsert) and a
public `openDraft` that throws `TPL_PUB_004` when a draft already exists.
File: `apps/pulse-server/.../template-version.service.ts`.

### 9. Routing-rule responses omitted their `id` — `pulse-server` + `pulse-web` (correctness)

Routing-rule create/list/get never returned the row `id`, yet edit/delete require it in the URL — so the console
could not manage rules it had just created. (`RuleList` already read `.id`; it was always `undefined`.)
**Fix**: added `id` to the routing-rule response DTO; regenerated pulse-web's `api-types.gen.ts` so the contract
is in sync. Runtime delete/repoint now works.
Files: `apps/pulse-server/.../sender-routing-rule.dto.ts`, `apps/pulse-web/src/lib/apis/api-types.gen.ts`.

### 10. Console list search never reached the server — `packages/web` (correctness)

Typing in the Pulse `/templates` (and `/senders`, `/routing`, `/logs`) search boxes updated the URL but never
the outgoing request: the shared `useSearchParams` hook read `router.state.location.search` via the
non-reactive `useRouter()`, so a search-only navigation didn't re-render the list.
**Fix**: read search state via `useRouterState({ select })` so list pages re-render on search change. One shared
hook fixes all four pages.
File: `packages/web/src/router/use-search-params.ts`.

### 11. Web Novel home shipped empty SSR and refetched on hydration — `web-novel-web` (correctness/perf)

The home route loader non-blocking-prefetched only two of the three catalog rows the screen renders (the
`popular`/ranked row, added later, was never prefetched) and used `void prefetchQuery`, so the server streamed
the shell before any catalog data resolved — the raw SSR HTML carried zero novel cards and the client refetched
the un-prefetched row after hydration. Surfaced by the pre-existing `ssr-hydration.spec.ts` (not a regression
from this pass).
**Fix**: the loader now blocks on all three rows via `ensureQueryData` inside `Promise.allSettled` (SSR renders
the cards; a warm client hydrates without refetching; a catalog outage still falls through to a client fetch
instead of failing the page).
File: `apps/web-novel-web/src/routes/_shell/index.tsx`.

### 12. ORGANISATION-visibility novels denied to genuine members — `devops` config (interconnect/access)

A logged-in org member was denied an `ORGANISATION`-visibility novel with 404 `WBN_001`, even though their
membership row was correct. web-novel resolves org membership by calling identity's internal directory
(`GET /api/v1/internal/organisations/:org/members/:sub`) via `AuthClient.fetchService('identity-server', …)`,
which resolves the bare, cross-namespace `http://identity-server` and fails to connect; deny-by-default then
returns 404. (The auth back-channel's token call was unaffected — it uses the namespace-qualified
`AUTH_IDENTITY_URL`.) Same class as bug #3.
**Fix**: set `SERVICE_URL_IDENTITY_SERVER: http://identity-server.identity` on web-novel-server so
ServiceDiscovery resolves the namespace-qualified host — a runtime env override, applied without an image
rebuild. Verified: an accepted org member now reads the ORGANISATION novel (200) while non-members and guests
still get 404. Novel Forge's identity calls (`resolveUsersByEmail`) were unaffected — they route through the
SDK's `directory()` path on `identityUrl`, not `fetchService`.
File: `devops/applications/web-novel/server/values-dev.yaml`.

### 13. Identity portal didn't redirect on mid-session expiry — `identity-web` (UX/auth)

When a session ended while the identity portal (or admin console) was open, an in-app (client-side) navigation
kept rendering the cached account page instead of bouncing to login — the route-entry `beforeLoad` gate does
not re-run for a reused layout match, and identity-web (unlike Novel Forge and Pulse) did not run the shared
in-shell guard. Not a security hole (the server still rejects every real request), but the app kept rendering
after the session was gone.
**Fix**: bound `@shadow-library/web`'s `useSessionGuard` into identity-web's `_portal` and `console` shells
(the same wiring Novel Forge and Pulse use) — it re-validates on every in-app navigation and on tab refocus and
withholds the shell behind a spinner while it bounces to `/login`. Verified: a client-side hop between portal
pages after expiry now redirects to login. (Web Novel deliberately keeps its current behavior — it is an
offline-first reader, so `/library`/`/history` continue to render device-local data on expiry and recover to
login on a reload.)
Files: `apps/identity-web/src/lib/session.ts`, `.../routes/_portal.tsx`, `.../routes/console.tsx`.

## Investigated — not a bug

### `/logs` "redirect loop" (pulse-web)

Reported during spec-writing but not reproducible: `/logs` resolves to the message-log route in both dev and
production builds; `/logs/` → `/logs` is a normal single 307 (TanStack `trailingSlash: 'never'`), not a loop.
The original report conflated a backend-less-probe 500 with a routing failure. No change made.

## Documented platform behaviors (asserted as-is, by design)

- **Logout is identity-scoped**: identity signout clears its central session; consumer-app opaque sessions are
  independent and survive (no back-channel logout is wired). Asserted as the real model in `cross-app/sso.spec.ts`.
- Cross-user access to another user's Novel Forge project → **404 `PRJ_001`** (never 403) — deliberate BOLA
  non-disclosure.
- Unreadable/nonexistent web-novel novels return **byte-identical 404s** (enumeration safety).
- web-novel `/internal/*` is not routed on the public edge at all (SPA 404 shell) — stronger than a 401.
- Admin mutations require step-up first → `AUTH_006` before `ADM_001`.

## Known gaps / follow-ups (not fixed in this pass)

- **Novel Forge AI gateway key**: `AI_ANTHROPIC_API_KEY` (the CLI-gateway token) is absent from
  `secrets/dev/novel-forge.enc.env`. Until it is added (SOPS) and novel-forge-server restarted, all AI calls
  fail and the AI e2e tests self-skip. The gateway daemon itself was installed during this pass.
- **Haiku model-id mismatch**: the Settings → Models dropdown submits the dated `claude-haiku-4-5-20251001`,
  which the dev CLI-gateway allowlist rejects; the API path must use the undated `claude-haiku-4-5`. Align the
  model registry id or add the dated alias to the gateway. Low impact (API path works).
- **Pulse `/send` console page** requires the `notifications:send` scope, which is granted only to the
  identity-server service client — no human role (incl. PulseAdmin) can use it. Likely a design question rather
  than a bug.
- **Novel Forge auto-push job-dedup race** (latency, not data loss): `POST /publish` enqueues a converge job;
  `POST /chapters/N/publish` calls issued immediately after are deduped onto that in-flight job, which had
  already read the ledger before any chapter row existed — so it finishes having pushed 0 chapters, and they
  linger `scheduled` until the janitor sweep or an explicit `POST /publications/reconcile`. Chapters do
  eventually arrive; a UI user publishing metadata then chapters in quick succession would see a delay.
  Suspected `JobService.enqueue` discarding the re-enqueue instead of scheduling a follow-up converge
  (`apps/novel-forge-server/src/modules/jobs/job.service.ts`).
- **Orphaned reader novels**: deleting a Novel Forge project does not retract the already-published novel from
  web-novel (one-way-push design), so reader rows accumulate. A retract-on-delete (or a reader-side GC) would
  close this.
- **Novel Forge wiki authoring** is API-only: the import bundle carries no wiki/entities, and `CreateEntityBody`
  exposes neither `firstSeenChapter` nor `wikiVisibility` — spoiler gating must be engineered via canon-fact
  reveals or body-less entities. Verified working end-to-end, but non-obvious for authors.
- **Test-environment noise (not product defects)**: identity's auth rate limits are per-IP and shared across
  the suite (`login/init` 20/hour, `register/init` 5/hour) — the SSO and registration-OTP delivery tests skip
  cleanly when a host has run the suite several times within the hour. And under `fullyParallel` with unlimited
  local workers, the SSO redirect-chain test can occasionally exceed its 30s wait when many OIDC hops saturate
  the single-node k3d cluster at once; it passes on retry (CI runs with `retries: 1`, which absorbs it).
- `web-novel-server` briefly CrashLoopBackOffs on a cold cluster start (boots before Postgres is ready) and
  self-recovers; a startup-probe/retry review would remove the transient.
