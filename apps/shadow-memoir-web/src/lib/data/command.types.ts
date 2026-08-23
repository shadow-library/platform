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
  | { type: 'plan.setLock'; from: string; to: string; locked: boolean }
  | { type: 'expense.record'; amountMinor: number; currency: string; note: string }
  | { type: 'metric.record'; metric: MetricKind; value: number }
  | { type: 'weight.record'; value: number; unit: 'kg' | 'lb' }
  | { type: 'journal.record'; text: string }
  | { type: 'sideQuest.record'; text: string; statAffinity: StatAffinity };

export type CommandType = Command['type'];

export interface CommandOutcome {
  status: 'applied' | 'queued';
  message: string;
  xpAwarded: number;
  coinsAwarded: number;
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
}

export type CommandResult = CommandOutcome | CommandConfirmation | CommandRejection;

/** The result of a command that has no confirmation step, so callers can read `message` without narrowing. */
export type SettledCommandResult = CommandOutcome | CommandRejection;

export function needsConfirmation(result: CommandResult): result is CommandConfirmation {
  return result.status === 'needs-confirmation';
}
