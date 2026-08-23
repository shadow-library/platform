# Observability

Solo-operator scale (ARCHITECTURE §24): no Prometheus, no dedicated metrics backend. Every operational
counter is a structured, `metric`-tagged log line; alerting hooks off log patterns at the cluster layer.
This doc is the alert-threshold reference those hooks are configured against.

## Metric log line format

Every counter — existing or future — is logged via `logMetric` (`src/telemetry/metrics.ts`) and always
carries the same two fields, plus whatever context the caller adds:

```json
{ "metric": "<dot.namespaced.name>", "value": <number>, "...context": "..." }
```

- `metric` — a stable, dot-namespaced name (`<subsystem>.<counter>`), never renamed once shipped —
  alert rules match on it verbatim.
- `value` — the numeric reading. A gauge (current level) or a rate (0–1), documented per metric below.
- Everything else on the line is free-form context (counts, thresholds, ids) for triage, not for
  alerting on directly.

New counters call `logMetric(logger, message, metric, value, extra?, level?)` rather than hand-building
the object, so the shape never drifts.

## Gauges vs. sweep-result lines

Two related but distinct things get logged:

1. **Gauges** — a point-in-time reading, sampled once per scheduler heartbeat via
   `SchedulerService.registerGauge(metric, fn)` and logged as `Scheduler gauge sample`. Registering a
   gauge needs no change to `SchedulerService` itself — a subsystem wires in independently, whenever it
   lands.
2. **Sweep-result / request-path lines** — a metric emitted directly by the subsystem that computed it
   (e.g. the FX reconciliation sweep, or a sync batch), logged alongside its own descriptive message.

A subsystem whose failure is per-request rather than per-sweep logs the failure itself as untagged
triage context and exposes the _level_ as a gauge — `RolloverService` is the worked example: each failed
walk writes a `rollover_failed` error line carrying the account and cause, while `rollover.failures`
reports how many accounts are currently behind. Only the gauge is alerted on, so a single retried
failure does not page.

## Current counters

| Metric                               | Kind                | Source                                   | Meaning                                                             | Alert threshold                                                                                |
| ------------------------------------ | ------------------- | ---------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `scheduler.tick`                     | sweep-result        | `SchedulerService` heartbeat, every tick | Cumulative tick count; `ran`/`failed` sweep names travel as context | Alert if no `Scheduler heartbeat` line appears for `>3× scheduler.tick-interval-ms` (liveness) |
| `fx_reconciliation.unresolved`       | sweep-result        | `FxReconciliationService.run`            | Expenses still carrying a null FX rate after the sweep              | Alert if `value > 0` for `>2` consecutive hourly sweeps                                        |
| `fx_reconciliation.unresolved_stale` | sweep-result (warn) | `FxReconciliationService.run`            | Expenses unresolved past 48h (`UNRESOLVED_ALERT_HOURS`)             | Alert immediately — any occurrence is already past the in-app threshold                        |
| `sync.command_error_rate`            | request-path        | `SyncService.submitBatch`                | `failed / commandCount` for the batch (0–1)                         | Alert if the rolling rate over a 15-minute window exceeds `0.05`                               |
| `rollover.failures`                  | gauge               | `RolloverService`, per heartbeat         | Accounts whose day-close walk raised and has not since completed    | Alert on any `value > 0`                                                                       |

## Registered but not yet sourced

These land as real gauges once their owning subsystem ships; the registration point
(`SchedulerService.registerGauge`) and the log format already exist, so wiring one in is additive —
no format change, no new alert-rule shape. **No fake data is emitted for these today; they simply do not
appear in the log stream until registered.**

| Metric                               | Owning task                       | Meaning (once wired)                                                        | Suggested threshold                             |
| ------------------------------------ | --------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| `ai_tasks.pending_age_seconds`       | T-33 (AI batch executor)          | Oldest unclaimed `ai_tasks` row's age                                       | Alert if `> ai.task-timeout-minutes × 2`        |
| `receipts.orphan_count`              | T-26 (receipt storage)            | Objects with no matching `receipts` row after a sweep                       | Alert if `value > 0` for `>1` consecutive sweep |
| `account_deletion.stuck_age_seconds` | T-30 (resumable account deletion) | Oldest non-`done` deletion state older than the 15-minute resumption window | Alert if `> 30` minutes                         |

## Log redaction

`src/database/log-redaction.ts` builds a `fast-redact`-based winston format from
`getSensitivityManifest()` (`src/database/sensitivity.ts`) — every `sensitive()`-wrapped column name is
redacted wherever it appears in a log call's metadata, at up to 4 levels of nesting, regardless of which
module logged it. It is wired on every transport in `src/main.ts` and `src/worker.ts`. This is
defense-in-depth: the primary guarantee is the DTO-shaped logging convention (ARCHITECTURE §24) — handlers
log identifier records, never entity objects — enforced by `tests/privacy/canary.spec.ts`.

Adding a `sensitive()` column to any schema joins the redaction set and the canary suite's coverage
automatically; no code outside the schema file changes.

### Known gap: `packages/fastify`'s `DefaultErrorHandler` (out of T-28's scope)

`tests/privacy/canary.spec.ts` found — and deliberately documents, rather than silently filtering away —
a real leak that name-based redaction cannot reach: on an **unmapped** Postgres constraint violation (any
constraint not in `constraintErrorMap`), `packages/modules`' `DatabaseService.translateError` wraps the
driver's error as the new `AppError`'s `.cause`, and `packages/fastify`'s `DefaultErrorHandler.handle()`
then logs both the handled error and its `.cause` chain verbatim (`logger.warn('Handling error', err)`,
`logger.warn('Caused by', err.cause)`). For a drizzle "Failed query" cause, `message`/`stack`/`params`
embed the statement's _bound values_ as text/array elements — not as named object fields — so a
manifest-driven, field-name redactor structurally cannot scrub them.

This is a shared-framework gap (`packages/fastify`), not something fixable from
`apps/shadow-memoir-server`; T-28 owns this app only. The suite's constraint-violation test excludes
exactly those two known log lines from its leak assertion, while a companion assertion in the same test
confirms the gap is still reproducible (so it doesn't quietly stop being true). Flagged here for a
follow-up task against `packages/fastify` — e.g. never log `.cause` verbatim, or redact `message`/`stack`/
`params` before logging it.

## Telemetry (analytics events)

`src/telemetry/events.ts` is the closed taxonomy — every event's payload is typed to ids, enums, and
numbers only (no free-text fields), and every event is keyed by `pseudoAccountId` (`src/telemetry/pseudo-id.ts`),
an HMAC-SHA256 of the account id under `telemetry.pseudo-id-secret` — never the account id itself.
`TelemetryService.emit` (`src/telemetry/telemetry.service.ts`) logs each event as `{ channel: 'telemetry',
name, payload }`. Health-class data (ARCHITECTURE §23) is structurally absent from the taxonomy — there is
no event shape it could be attached to.
