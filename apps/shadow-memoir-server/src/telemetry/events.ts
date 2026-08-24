import { type StatAffinity } from '@modules/rules';
import { type Expense, type HeroEvent, type Metric, type MetricEntry, type Subscription } from '@server/database';

/**
 * Opaque per-account key (ARCHITECTURE §23): an HMAC of the account id, never the id itself. Only
 * {@link pseudoAccountId} may construct one, so a raw string can never be passed off as one.
 */
export type PseudoId = string & { readonly __brand: 'PseudoId' };

interface TelemetryEventBase {
  pseudoId: PseudoId;
  occurredAtMs: number;
}

/**
 * A Hero-progression grant landed (quest completion, level-up, coin grant, achievement, …) — mirrors
 * `hero_events.type` (ARCHITECTURE §11.1). `note`/free-text fields never appear here; only the mechanical
 * deltas the ledger itself computed.
 */
export interface HeroEventRecordedEvent extends TelemetryEventBase {
  name: 'hero_event_recorded';
  eventType: HeroEvent.Type;
  xpDelta: number;
  coinsDelta: number;
  statAffinity: StatAffinity | null;
  statDelta: number;
  levelAfter: number | null;
  leveledUp: boolean;
}

/** An expense command was applied. `merchant`/`note`/`categoryId` never appear — ids/enums/numbers only. */
export interface ExpenseRecordedEvent extends TelemetryEventBase {
  name: 'expense_recorded';
  source: Expense.Source;
  hasReceipt: boolean;
  hasFxConversion: boolean;
}

/** A subscription billing cycle was confirmed (a coin grant, distinct from the underlying `hero_event_recorded`). */
export interface SubscriptionCycleConfirmedEvent extends TelemetryEventBase {
  name: 'subscription_cycle_confirmed';
  frequency: Subscription.Frequency;
}

/**
 * A `metric.register` command landed a value against a non-health metric (ARCHITECTURE §18): health-class
 * entries never reach this event at all — the caller checks `isHealth` before emitting, so there is no
 * conditional field here for a leak to hide behind.
 */
export interface MetricEntryRecordedEvent extends TelemetryEventBase {
  name: 'metric_entry_recorded';
  valueType: Metric.ValueType;
  source: MetricEntry.Source;
}

/** A sync command batch was submitted, with its outcome shape only — never a command's payload. */
export interface QuickLogRecordedEvent extends TelemetryEventBase {
  name: 'quick_log_recorded';
  module: 'journal' | 'meal' | 'weight' | 'side_quest';
  rewarded: boolean;
  backdated: boolean;
  linked: boolean;
}

export interface SyncBatchSubmittedEvent extends TelemetryEventBase {
  name: 'sync_batch_submitted';
  commandCount: number;
  appliedCount: number;
  failedCount: number;
  replayedCount: number;
}

/**
 * The closed analytics taxonomy (ARCHITECTURE §23–24): every member's payload is typed to ids, enums, and
 * numbers only, so a free-text value is structurally unrepresentable — there is no string-bag escape
 * hatch. Adding an event means adding a member here, not widening an existing one.
 */
export type TelemetryEvent =
  HeroEventRecordedEvent | ExpenseRecordedEvent | SubscriptionCycleConfirmedEvent | MetricEntryRecordedEvent | QuickLogRecordedEvent | SyncBatchSubmittedEvent;
