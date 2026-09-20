# Memoir

Gamified, single-owner life tracker: quests, hero progression, personal finance, quick logs, AI insights. Offline-first PWA (`memoir-web`) plus API (`memoir-server`).
Every record is one person's private data; nothing is shared, public or social. Authenticates via Identity (OIDC relying party); nothing here describes auth.

## Capabilities

- Quests (strictness, recurrence, client-side reminder preferences (the server sends no quest reminders), complete/partial/skip/postpone/reschedule) feeding Hero: XP, level,
  coins, stats, HP, streaks with shields, Crown, achievements, titles, cosmetics.
- Compassion mechanics: Recovery quests, a Comeback bonus armed by a miss, Returner (one streak shield after an absence; no XP or coins), plan lock, intensity modes. Momentum
  (cold/steady/warm) gates Comeback arming and capacity drives the plan-lock advisory. Misses cost HP and lost XP, never negative XP or shame.
- Finance: multi-currency expenses with FX capture, subscriptions, receipt images, receipt OCR structuring, monthly budget.
- Quick logs: journal, meals, weight, side quests, health metrics with threshold offers.
- AI insights: ad-hoc and scheduled queries answered asynchronously by a batch drain inside a server-time window (default 02:00-06:00; failed tasks retry around the clock) on in-cluster inference;
  results are suggestions the owner applies by hand. A lapsed account's task holds (`held_upgrade`) until the tier returns.
- Billing (free/paid, one trial, hosted checkout), email via `pulse` (AI ready, weekly digest, billing reminder), async data export, self-service deletion.

## Concepts

- Command: a client-minted intent (`quest.complete`, `expense.create`, ...) whose UUIDv7 id the server treats as an opaque idempotency key. Every write that touches Hero state is a command.
- Hero ledger: append-only `hero_events` (natural-key `dedupeKey`); `accounts` totals mirror its sums. Events stamp the ruleset version (a pure `rules` module owns all math).
- Rollover: closing an elapsed local day (misses, HP, Crown settle, streak, comeback arming). Days are always in the account's timezone.
- Crown: a daily XP/coin endowment weighted by strictness; missed slices are forfeited, the remainder banks when the period (daily, or weekly under low intensity) closes.
  Comeback: armed by a miss, fires on the next eligible completion, then re-arms. Returner: a streak shield after an absence.
- Delta domain: a synced table or snapshot. Keyset domains carry `sync_seq` from one global sequence; snapshot domains resend in full.

## Architecture

- One Postgres. One server process hosts HTTP and the in-process scheduler running all sweeps; a built, tested worker entrypoint registers no sweeps (`scheduler.enabled`, default on, would hand them over).
- Client (PWA): IndexedDB mirror plus persisted FIFO outbox; writes apply optimistically and enqueue; API traffic is never cached. History, Insights and Review derive client-side.
- Sync: POST an ordered command batch, then GET delta pages by `since` cursor. A sync epoch change makes the client drop its mirror and re-pull, keeping its outbox; the first epoch a fresh mirror sees is adopted, not treated as a change.
- Command path: rollover catch-up, then one transaction under a per-account advisory lock: claim id in the command log, run handler, record result; replay returns it.
- A domain error stops the batch at that command. A failure holds the queue only if its error code is catalogued as retryable; every other code, known or not, is dead-lettered locally (last 50 kept)
  and later commands proceed.
- Delta cursor is held back by an overlap so late-committing lower sequences are re-served; client upserts by primary key. Deleting a row in a keyset domain writes a
  `deleted_records` tombstone; snapshot domains propagate removals by replacing the set.
- Rollover runs lazily before every command and delta pull, one transaction per day; a failed day stops the walk, never fails the caller. Days beyond the 90-day catch-up
  bound are skipped, never closed.
- Integrations: `identity` (login, sessions, scopes seeded in its bootstrap); `pulse` (server-to-server send, templates seeded there); object storage; in-cluster inference; FX API.

## Hard rules

- MUST route every Hero-affecting write through the command bus and move XP/coins/stats only via the hero ledger inside its transaction. `hero_events` is append-only by convention (nothing in the schema blocks an UPDATE; only account deletion purges it): NEVER update or delete it.
- MUST make each grant idempotent by deterministic `dedupeKey`; a duplicate is convergence, not failure. Coin spends beyond balance are refused, not clamped.
- MUST reach user-owned tables from request-scoped code through the owner-scoped repository; foreign ids read as nonexistent. `forAccount()` is its read-only cross-account
  hatch; system repositories take the raw client under a lint rule. Bot principals are refused outright.
- MUST stamp a fresh `sync_seq` on every update (repository layer, no trigger), register a delta source per new synced domain, and teach the web store its primary key.
- Client time is a claim: `performedAt` is honoured only for quest occurrence actions, clamped to [occurrence day start, server now]; every other handler, entitlement and quotas use server time. Timezone and intensity-mode changes apply at rollover, never mid-day.
- NEVER mutate a published ruleset version (compile-time `readonly` only); append a new one. Paid state MUST NOT be an input to any progression computation.
- Quick logs and health thresholds never complete a quest; only `quest.complete` does. Soft caps advise. Recovery never spawns Recovery; Comeback never repays the arming miss (a property test, not a production guard).
- Money: integer minor units; a saved expense's currency is immutable. FX is captured at write; an unresolved rate is filled later at the expense's date, NEVER today's or invented.
- Built-in `uncat` and `subs` categories cannot be archived; custom categories do not exist. Expense creates, edits, deletes and receipt confirmations are audited (a delete
  prunes the prior rows and leaves one `deleted` row).
- `BillingRepository` is the only writer of entitlements: the webhook (signature-verified over the raw body, deduped by event id, applied monotonically by provider time, one trial per account) and the lapse sweep; no user route writes one.
  A period ending unrenewed reads as lapsed immediately; grace only on a provider dunning signal. An empty webhook secret refuses every delivery.
- OCR quota is consumed before structuring, per attempt. AI quota is checked under the account lock, submission deduped on client-minted id; paid gate daily, free gate monthly.
- AI task row is a request, not authorization: deletion, entitlement, consent (gated only for the journal-reflection and health data classes; ungranted until a row exists) and tier scope are re-derived at execution.
- AI output MUST pass seven guardrails: quotes of the owner's text, identity or clinical labels, shame copy and mechanic claims reject the task; off-set or foreign-quest
  suggestions are dropped; crisis input replaces the answer with a fixed supportive response that ships as an ordinary result.
- AI suggestions are a closed set of fields the owner can already edit by hand; AI never mutates mechanics.
- User data NEVER reaches a third-party endpoint: inference must be in-cluster; production boot refuses otherwise (off-production any host is allowed; an unset inference URL disables AI silently). FX calls carry currency pairs only.
- Sensitive columns live in one manifest driving log redaction and export labelling; the AI no-quote check uses a separate hand-listed set. Telemetry is closed and pseudonymous.
  NEVER log journal, notes, health values or emails. There is no metrics backend: counters are `metric`-tagged log lines and alerts are occurrence-based.
- Notifications are off unless the owner's pref is true, limited to three categories, sent through an outbox so a `pulse` failure never fails the triggering operation.
- Deletion: pending marker first, then session revoke; afterwards every route but the deletion surface refuses. Steps are idempotent and swept; NEVER hand-edit `accounts.deletion_state`.
- The client outbox is dropped only on an outcome or an explicit sign-out / account-deletion wipe; it survives session death and epoch reset; a different account never inherits it.
- The two reconciliation sweeps compare mirrors to ledgers and only alert, never repair (a third prunes the command log); `hero_events` and `quest_logs` are the authoritative recomputation sources.

## Non-goals

- No social, sharing, public profiles or organisation-owned principals. No third-party AI. No server read model for History, Insights or Review. No meal macros (calories only).

## Open work

- Deletion rests at `data_deleted` while Identity's machine-side close is unconfigured (soft-close only; Identity never hard-deletes). Not a bug.
- Payment provider is unchosen; the shipped adapter is a generic HMAC placeholder.
- The web never calls `/ocr/parse` and never sets a device's push fields, so those server surfaces are unreachable from the shipped client. Some web domains fall back to fixtures until synced.
