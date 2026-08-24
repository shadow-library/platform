# Operational Runbooks

Solo-operator scale (ARCHITECTURE §24, §29): one API replica, in-process scheduler, no dedicated on-call
tooling. Every runbook below starts from a `metric`-tagged log line (`docs/observability.md`) or a plain
structured error line — there is no dashboard, only `kubectl logs` / the cluster log sink and its search.

## §27 failure-mode reference

Every row of ARCHITECTURE §27, restated as detection signal + operator action. Rows with a dedicated
procedure below are linked; the rest are single-line entries because their recovery is "restart the
process" or "wait for the retry" and nothing more is actionable.

| Failure                                                | Detection signal                                                              | Operator action                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| identity-server down                                   | Spike in 401s on API logs; identity's own liveness probe failing              | Restart/investigate identity-server; shadow-memoir needs no action — cached tokens and offline use absorb the outage |
| shadow-memoir API down                                 | k8s readiness probe failing; no `/sync/commands` traffic in logs              | `kubectl rollout restart` the Deployment; commands replay idempotently once it's back (§11.3)                        |
| PostgreSQL down                                        | Every DB-backed request 5xxing; connection-pool errors in logs                | See [Restore / connectivity drill](#restore-drill-and-connectivity-loss) below                                       |
| Scheduler stalls (tick loop wedged / process degraded) | No `Scheduler heartbeat` line for `>3× scheduler.tick-interval-ms`            | Restart the process; every sweep is idempotent and resumes from where the DB state, not in-memory state, left off    |
| Inference service down                                 | `ai_tasks.pending_age_seconds` climbing; worker retry-exhausted failures      | See [AI backlog](#ai-backlog) below                                                                                  |
| pulse / push down                                      | Notification-send errors in logs; pulse's own liveness                        | No action required — results still appear on next app foreground poll; pulse's own retry queue handles delivery      |
| FX provider down                                       | `fx_reconciliation.unresolved` / `fx_reconciliation.unresolved_stale` > 0     | See [FX stall](#fx-stall) below                                                                                      |
| Garage down                                            | Presign/upload/download errors on `/receipts/*`                               | No action required — expense saves without a receipt; user retries the upload once Garage recovers                   |
| Billing webhooks delayed/replayed                      | Webhook error logs on `/billing/webhooks/{provider}`; entitlement lag reports | See [Webhook replay](#webhook-replay) below                                                                          |
| Deletion interrupted                                   | `account_deletion.stuck_age_seconds` gauge > 30 minutes (once T-30 wires it)  | See [Deletion stuck](#deletion-stuck) below                                                                          |
| Device lost mid-outbox                                 | Not server-observable (device-local)                                          | None possible server-side; inherent to offline-first physics (§27) — no runbook action exists                        |
| Browser evicts site storage                            | Not server-observable (device-local)                                          | None possible server-side; client re-pulls full state from `sync_epoch` on next login                                |
| Two devices race                                       | Not an error — `sync.command_error_rate` stays nominal                        | No action; §11.3's convergence guarantee is the whole answer                                                         |
| Rollover failure (bug/data)                            | `rollover.failures` gauge > 0; `rollover_failed` error lines                  | See [Wedged rollover](#wedged-rollover-corrupt-recurrence) below for the persistent case                             |

---

## Restore drill and connectivity loss

Required at least once before launch (PRD §5.4, ARCHITECTURE §30) and re-run whenever the backup pipeline
changes.

1. **Provision an empty database** in a scratch environment (never against dev/preview/prod).
2. **Restore the most recent nightly `pg_dump`** (Garage backup bucket) into it.
3. **Run the `migrate` Job** against the restored database so its schema matches HEAD.
4. **Smoke-check invariant queries**:
   - `SELECT account_id, SUM(xp_delta) FROM hero_events GROUP BY account_id` sampled against a handful of
     `accounts.total_xp` mirrors — should agree (this is exactly what `reconciliation-drift`'s sweep
     automates going forward; the drill is the manual version against restored data).
   - Row counts on `accounts`, `hero_events`, `quest_logs`, `command_log` — sanity, not exact-match
     (the dump has a point-in-time cutoff).
5. **Bump `sync.epoch`** in the values file before repointing traffic — every client cursor invalidates and
   forces a full re-pull against the restored `sync_seq` sequence, which is the explicit (not heuristic)
   cursor-invalidation contract (§30).
6. **Repoint the app** at the restored database and confirm `/sync/delta` and `/sync/commands` succeed
   end-to-end against a test account.
7. Record the drill's duration and any deviation from these steps — that number is the RTO estimate (§30
   target: within a working session, hours).

**Live PostgreSQL outage** (not a drill): every DB-backed request fails immediately — there is no
degraded-but-working mode server-side. Confirm the in-cluster Postgres's own health first; if it needs a
restore, follow steps 1-6 above against the live environment. There is no server-side data-loss risk beyond
the backup window (§30's RPO) — `command_log` idempotency and offline-first devices absorb the gap on the
client side once service resumes.

## Deletion stuck

**Failure**: `account_deletion.stuck_age_seconds` (T-30) shows a non-`done` deletion state older than the
15-minute resumption window the deletion state machine is designed to self-heal within.

**Detection**: the gauge crossing 30 minutes; absent that gauge landing yet, a manual check —
`SELECT id, deletion_state, deletion_started_at FROM accounts WHERE deletion_state <> 'none' AND deletion_state <> 'done' ORDER BY deletion_started_at`.

**Operator action**:

1. Identify the stuck account and its current `deletion_state` (`pending` / `blobs_deleted` / `data_deleted`
   / `identity_closed`).
2. Every step of the deletion state machine is idempotent by design (§21) — the worker sweep re-drives a
   stuck account automatically on its own cadence. First action is simply to confirm the worker/scheduler
   process is actually running (`Scheduler heartbeat` line present); if it stalled, restart it per the
   scheduler-stall row above.
3. If the state machine is running and the account is still stuck past the resumption window, check the
   error logged at the step it's stuck on (each step logs its own failure with the account id and cause) —
   the most likely cause is a downstream dependency (identity's `DELETE /api/v1/me`, Garage) being down;
   resolve that dependency and let the next sweep pass drive the account forward.
4. Never hand-edit `accounts.deletion_state` directly — every transition has side effects (blob deletion,
   identity revocation, data anonymization) the state machine performs, not the row update.

## FX stall

**Failure**: the FX provider (`fx.provider-url`) is unreachable or erroring; expenses in foreign currencies
save with a null rate and their totals show a pending-conversion marker (§27).

**Detection**: `fx_reconciliation.unresolved > 0` for more than 2 consecutive hourly sweeps, or
`fx_reconciliation.unresolved_stale > 0` (any occurrence — that metric only fires once an expense has been
unresolved for 48h, already past the in-app threshold).

**Operator action**:

1. Confirm the provider is actually down (`curl` `fx.provider-url` directly, or check the sweep's own error
   logs from `FxReconciliationService.run`).
2. No server-side data loss: expenses persist with a null rate and each hourly sweep retries them
   automatically once the provider recovers (§14.1) — no operator repair action needed for the data itself.
3. If the provider is down for an extended period and users are asking, consider a temporary FX provider
   override (`fx.provider-url` is `reloadable`-adjacent via Config, but is not itself hot-swappable; a config
   change requires a rollout) pointing at a fallback provider.
4. Once the provider recovers, watch `fx_reconciliation.unresolved` return to 0 over the next few sweeps —
   pairs warm before historical backfill (§14.1's warm-then-backfill order), so a full drain can take a few
   cycles for a large backlog.

## Webhook replay

**Failure**: the billing provider delays or replays webhook deliveries (§27); entitlement projections lag
behind the provider's actual state, or the same event arrives more than once.

**Detection**: webhook error logs on `POST /billing/webhooks/{provider}`; a user report of entitlement
lag; `billing_events` rows with unexpected gaps.

**Operator action**:

1. Replays are structurally safe — `billing_events` is keyed by the provider's event id (§25's **P**
   idempotency), so a redelivered event is a no-op against the ledger. No action needed purely because an
   event arrived twice.
2. For genuine lag (an event never arrived), use the billing provider's dashboard to **manually redeliver**
   the specific event — this is the primary recovery path; the endpoint's signature verification accepts any
   correctly-signed redelivery regardless of how old it is.
3. Confirm `billing.webhook-tolerance-seconds` (signature timestamp tolerance) isn't itself rejecting valid
   but late deliveries — if the provider's redelivery is far outside tolerance, check provider-side clock
   skew before assuming a data problem.
4. After redelivery, confirm the account's entitlement state via `GET /account` (or a direct
   `billing_events`/entitlement table read) rather than trusting the webhook alone landed correctly.

## AI backlog

**Failure**: the inference service is down or degraded; `ai_tasks` rows accumulate unclaimed, or worker
retries exhaust and tasks fail (quota refunded per §27).

**Detection**: `ai_tasks.pending_age_seconds` (T-33) exceeding `2 × ai.task-timeout-minutes`; a rise in
"failed, not charged" results user-visible in the app.

**Operator action**:

1. Confirm the inference service (`ai.model` target) is actually reachable — this is almost always an
   upstream outage, not a shadow-memoir bug.
2. `ai_tasks` is itself the queue (§29 — "PostgreSQL is the queue") — no separate queue to drain or purge.
   Once the inference service recovers, the worker's claim loop resumes automatically on its own batch
   window (`ai.batch-window`) or next poll, whichever the executor uses; no manual replay is needed.
3. Tasks that already exhausted their 3 retries and failed are terminal — the "failed, not charged" state is
   correct and final for that task; the user re-submits if they still want the result. No operator repair.
4. If the backlog is large and time-sensitive, `ai.task-timeout-minutes` can be raised temporarily to avoid
   new tasks timing out mid-recovery — revert once the backlog clears.

## Wedged rollover (corrupt recurrence)

**Failure**: a malformed `quests.recurrence` payload (T-19's canary case: a hand-corrupted or
otherwise-invalid recurrence `jsonb`) makes `occursOn` raise for that quest, which makes the day-close walk
for its account raise, which stops that account's rollover at the day before — `daily_states.rollover_at`
never lands for the failing day and `accounts.last_hp_date` never advances past it (§13.3's "quiet to the
user, loud to the operator" contract: the account's own commands and delta pulls keep working against a
day that stays honestly open).

Unlike ordinary inactivity — where `last_hp_date` also lags, simply because nobody has opened the app to
trigger `ensureCurrent` — a wedged account keeps _trying_: `command_log` keeps gaining rows for it well
past the point rollover should have caught it up. That's the signal the weekly sweep looks for.

**Detection**:

- `rollover.failures` gauge > 0 (in-process signal, resets on restart — catches it only while the failing
  process is still up).
- `reconciliation.wedged_accounts` (weekly sweep, DB-truth signal, survives restarts) — any account whose
  `last_hp_date` lags `reconciliation.wedged-last-hp-lag-days` behind a `command_log` row timestamped after
  that lag window. `accountPseudoId`s travel in the log line's context (capped list).
- `rollover_failed` error log lines carry the account id and the raised cause directly — the fastest path
  from "an account is wedged" to "here is the exception and the quest it came from".

**Operator action**:

1. Resolve the pseudo id back to a real account id (the pseudo-id secret is ops-held; this is a deliberate
   extra step per §23 — never skip straight to raw ids from a log line alone in a wider audience).
2. Find the exact cause from the `rollover_failed` log line's stack/cause, or reproduce locally by calling
   `RolloverService.ensureCurrent(accountId)` against a copy of the account's `quests` rows — T-19's canary
   case is a `recurrence` value that fails `occursOn`'s parse/evaluate path.
3. **Fix the data, not the code path**: identify the offending `quests.recurrence` value
   (`SELECT id, recurrence FROM quests WHERE account_id = $1 AND active`) and correct it to a valid
   recurrence shape directly (or deactivate that one quest, `active = false`, if the user no longer needs
   it) — never patch around a malformed row by relaxing `occursOn`'s validation, which would just let a
   different malformed shape through later.
4. Re-run the walk: `RolloverService.ensureCurrent(accountId)` (or simply wait for the account's next
   `/sync/delta`/`/sync/commands` call, which calls the same path). The walk is idempotent (§13) — it
   resumes exactly at the day it stopped on, with every day before that already closed.
5. Confirm recovery: `rollover.failures` drops for that account, and the next weekly sweep's
   `reconciliation.wedged_accounts` no longer names it.
