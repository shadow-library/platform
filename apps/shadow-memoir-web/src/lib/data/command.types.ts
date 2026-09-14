import { type QuestDraft, type ReasonTag, type StatAffinity } from './quest.types';
import { type MetricKind } from './view.types';

export type Command =
  | { type: 'quest.complete'; occurrenceId: string }
  | { type: 'quest.partial'; occurrenceId: string; progress: number; reasonTag: ReasonTag; note?: string }
  | { type: 'quest.skip'; occurrenceId: string; reasonTag?: ReasonTag; note?: string }
  | { type: 'quest.postpone'; occurrenceId: string; reasonTag?: ReasonTag }
  | { type: 'quest.reschedule'; occurrenceId: string; toMin: number; acceptBeyondCap?: boolean }
  | { type: 'quest.create'; draft: QuestDraft }
  | { type: 'quest.update'; questId: string; patch: Partial<QuestDraft> }
  | { type: 'quest.setActive'; questId: string; active: boolean }
  | { type: 'plan.setLock'; date: string; locked: boolean; questIds: string[] }
  | { type: 'expense.record'; amountMinor: number; currency: string; note: string }
  | { type: 'metric.record'; metric: MetricKind; value: number }
  | { type: 'weight.record'; value: number; unit: 'kg' | 'lb' }
  | { type: 'journal.record'; text: string }
  | { type: 'sideQuest.record'; text: string; statAffinity: StatAffinity };

export type CommandBoundary = 'closed' | 'owner-changed' | 'principal-changed';

/** `refusal` is the server deciding against the change, so asking again cannot help; `unavailable` is the request not getting a decision at all. */
export type CommandErrorKind = 'refusal' | 'unavailable';

export interface CommandError {
  code: string;
  kind: CommandErrorKind;
}

/** Kept on the device with nothing sending: `offline` (no connection), `held` (signed out or a retryable failure), `deletion` (the account is being deleted). `slow` is still being sent. */
export type UnconfirmedReason = 'offline' | 'held' | 'deletion' | 'slow';

export type ServerSettlement =
  | { status: 'applied'; result: Record<string, unknown> }
  | { status: 'rejected'; code: string | null; result: Record<string, unknown> }
  | { status: 'superseded'; result: Record<string, unknown> }
  | { status: 'failed'; code: string | null }
  | { status: 'unconfirmed'; reason: UnconfirmedReason }
  | { status: 'refused'; boundary: CommandBoundary };

/**
 * A claim on one queued command's outcome. While it is held, the sync layer raises no notice for that command:
 * the holder presents it. `acknowledge` once presented; `release` when the holder can no longer present it, which
 * hands a non-applied outcome back to the global notices.
 */
export interface OutcomeTicket {
  settled: Promise<ServerSettlement>;
  acknowledge(): void;
  release(): void;
}

export type CommandDelivery = { status: 'local' } | { status: 'queued'; commandId: string; ticket?: OutcomeTicket } | { status: 'refused'; boundary: CommandBoundary };

export interface DispatchOptions {
  /** Claims the outcome of every command this dispatch queues; the result's `delivery` carries the ticket. */
  awaitOutcome?: boolean;
}

export interface CommandOutcome {
  status: 'applied' | 'queued';
  message: string;
  xpAwarded: number;
  coinsAwarded: number;
  delivery?: CommandDelivery;
}

/**
 * A reschedule past the rolling-7-day cap is never blocked — it reclassifies as a postpone once the owner
 * confirms, so the same command re-dispatched with `acceptBeyondCap` carries the decision (PRD §2.2).
 */
export interface CommandConfirmation {
  status: 'needs-confirmation';
  kind: 'reschedule-cap';
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  command: Command;
}

export interface CommandRejection {
  status: 'rejected';
  message: string;
  error?: CommandError;
}

export type CommandResult = CommandOutcome | CommandConfirmation | CommandRejection;

/** The result of a command that has no confirmation step, so callers can read `message` without narrowing. */
export type SettledCommandResult = CommandOutcome | CommandRejection;

export function needsConfirmation(result: CommandResult): result is CommandConfirmation {
  return result.status === 'needs-confirmation';
}

export type SettledOutcome<TLocal = unknown> =
  | { status: 'applied'; local: TLocal; xpAwarded: number; coinsAwarded: number }
  | { status: 'queued-offline'; local: TLocal; reason: UnconfirmedReason }
  | { status: 'rejected'; message: string; code: string | null }
  | { status: 'superseded'; message: string }
  | { status: 'failed'; message: string; code: string | null; undone: boolean }
  | { status: 'refused'; message: string; boundary: CommandBoundary };

export interface OutcomeConfirmation<TConfirm> {
  status: 'needs-confirmation';
  confirmation: TConfirm;
}

export type RunOutcome<TLocal, TConfirm = never> = [TConfirm] extends [never] ? SettledOutcome<TLocal> : SettledOutcome<TLocal> | OutcomeConfirmation<TConfirm>;
