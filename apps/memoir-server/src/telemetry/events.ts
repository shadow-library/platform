import { type StatAffinity } from '@modules/rules';
import { type Expense, type HeroEvent, type Metric, type MetricEntry, type Subscription } from '@server/database';

/** Opaque per-account key: an HMAC of the account id; only `pseudoAccountId` may construct one, so a raw string can't be passed off as one. */
export type PseudoId = string & { readonly __brand: 'PseudoId' };

interface TelemetryEventBase {
  pseudoId: PseudoId;
  occurredAtMs: number;
}

/** A Hero-progression grant landed; mirrors `hero_events.type`. `note`/free-text fields never appear here, only the mechanical deltas the ledger computed. */
interface HeroEventRecordedEvent extends TelemetryEventBase {
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
interface ExpenseRecordedEvent extends TelemetryEventBase {
  name: 'expense_recorded';
  source: Expense.Source;
  hasReceipt: boolean;
  hasFxConversion: boolean;
}

interface SubscriptionCycleConfirmedEvent extends TelemetryEventBase {
  name: 'subscription_cycle_confirmed';
  frequency: Subscription.Frequency;
}

/** A `metric.register` landed a value against a non-health metric; health entries never reach this event, the caller checks `isHealth` before emitting. */
interface MetricEntryRecordedEvent extends TelemetryEventBase {
  name: 'metric_entry_recorded';
  valueType: Metric.ValueType;
  source: MetricEntry.Source;
}

/** A sync command batch was submitted, with its outcome shape only — never a command's payload. */
interface QuickLogRecordedEvent extends TelemetryEventBase {
  name: 'quick_log_recorded';
  module: 'journal' | 'meal' | 'weight' | 'side_quest';
  rewarded: boolean;
  backdated: boolean;
  linked: boolean;
}

interface SyncBatchSubmittedEvent extends TelemetryEventBase {
  name: 'sync_batch_submitted';
  commandCount: number;
  appliedCount: number;
  failedCount: number;
  replayedCount: number;
}

/** The closed analytics taxonomy: every payload is ids, enums and numbers only, so free text is unrepresentable. Adding an event means adding a member here. */
export type TelemetryEvent =
  HeroEventRecordedEvent | ExpenseRecordedEvent | SubscriptionCycleConfirmedEvent | MetricEntryRecordedEvent | QuickLogRecordedEvent | SyncBatchSubmittedEvent;
