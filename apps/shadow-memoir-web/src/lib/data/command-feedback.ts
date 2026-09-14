import { toast, type ToastIntent } from '@shadow-library/ui';
import { isApiError } from '@shadow-library/web';

import { commandErrorCopy, commandErrorKind, NETWORK_ERROR_CODE } from './command-errors';
import { type CommandBoundary, type CommandError, type CommandRejection, type SettledOutcome, type UnconfirmedReason } from './command.types';
import { commandLabel, STATE_LABELS } from './labels';
import { type OccurrenceState } from './quest.types';

/** A server `rejected` outcome names what it needs in `result.kind` rather than in an error code. */
const REJECTION_KINDS: Record<string, string> = {
  'reschedule-cap': 'It has already been moved twice this week.',
  'needs-confirmation': 'There’s already a weight for that day.',
};

const REJECTED_FALLBACK = 'The server didn’t accept this change.';
const FAILED_FALLBACK = 'Something went wrong on our side.';
const SUPERSEDED_FALLBACK = 'Another device got there first, so this change wasn’t applied.';

const REFUSED_COPY: Record<CommandBoundary, string> = {
  'owner-changed': 'A different account is now signed in on this browser.',
  'principal-changed': 'A different account is now signed in on this browser.',
  closed: 'The app was reloading its data. Try again.',
};

const RETRY_AFTER_STATUSES = new Set([408, 429]);

/** A listed code's kind wins; otherwise the HTTP status says whether the server decided against the change. */
export function toCommandError(error: unknown): CommandError {
  if (!isApiError(error)) return { code: NETWORK_ERROR_CODE, kind: 'unavailable' };
  const listed = commandErrorKind(error.code);
  if (listed) return { code: error.code, kind: listed };
  const refusal = error.status >= 400 && error.status < 500 && !RETRY_AFTER_STATUSES.has(error.status);
  return { code: error.code, kind: refusal ? 'refusal' : 'unavailable' };
}

export function commandRefusal(error: unknown, fallback: string): CommandRejection {
  const commandError = toCommandError(error);
  return { status: 'rejected', message: commandErrorCopy(commandError.code, fallback), error: commandError };
}

export function rejectionCopy(code: string | null, result: Record<string, unknown> = {}): string {
  const kind = result['kind'];
  if (typeof kind === 'string' && Object.hasOwn(REJECTION_KINDS, kind)) return REJECTION_KINDS[kind] as string;
  return commandErrorCopy(code, REJECTED_FALLBACK);
}

export function failureCopy(code: string | null): string {
  return commandErrorCopy(code, FAILED_FALLBACK);
}

export function refusedCopy(boundary: CommandBoundary): string {
  return REFUSED_COPY[boundary];
}

function isOccurrenceState(value: unknown): value is OccurrenceState {
  return typeof value === 'string' && Object.hasOwn(STATE_LABELS, value);
}

export function supersededCopy(result: Record<string, unknown> = {}): string {
  if (isOccurrenceState(result['state'])) return occurrenceSupersededCopy(result['state']);
  if (result['charged'] === false) return 'It was already yours, so nothing was charged.';
  return SUPERSEDED_FALLBACK;
}

export function occurrenceSupersededCopy(state: OccurrenceState): string {
  return `Another device already recorded it as ${STATE_LABELS[state].toLowerCase()}.`;
}

export interface OutcomeFeedback {
  /** Shown once the change is applied; an empty string shows nothing. */
  success: string;
  /** The verb for a failure: "complete", "save", "delete". */
  action: string;
  /** What the command was about — a quest name, an expense note. Named in every toast that is not a success. */
  subject?: string;
}

export interface OutcomeToast {
  intent: ToastIntent;
  title: string;
  body?: string;
}

const UNCONFIRMED_TITLES: Record<UnconfirmedReason, string> = {
  offline: 'Saved on this device — will sync.',
  held: 'Saved on this device — will sync.',
  deletion: 'Saved on this device — this account is being deleted.',
  slow: 'Saved — syncing.',
};

function couldNot(action: string, subject: string | undefined, message: string, undone: boolean): string {
  const target = subject ? `${action} ‘${subject}’` : action;
  return `Couldn’t ${target}${undone ? ' — undone' : ''}: ${message}`;
}

export function outcomeToast(outcome: SettledOutcome, feedback: OutcomeFeedback): OutcomeToast | null {
  switch (outcome.status) {
    case 'applied':
      return feedback.success ? { intent: 'success', title: feedback.success } : null;
    case 'queued-offline': {
      const title = UNCONFIRMED_TITLES[outcome.reason];
      return { intent: 'neutral', title, ...(feedback.success ? { body: feedback.success } : {}) };
    }
    case 'rejected':
      return { intent: 'warning', title: couldNot(feedback.action, feedback.subject, outcome.message, outcome.undone) };
    case 'refused':
      return { intent: 'warning', title: couldNot(feedback.action, feedback.subject, outcome.message, true) };
    case 'failed':
      return { intent: 'danger', title: couldNot(feedback.action, feedback.subject, outcome.message, outcome.undone) };
    case 'superseded':
      return {
        intent: 'warning',
        title: feedback.subject ? `‘${feedback.subject}’ changed on another device: ${outcome.message}` : `Changed on another device: ${outcome.message}`,
      };
  }
}

function show(next: OutcomeToast | null): void {
  if (!next) return;
  toast[next.intent](next.title, next.body ? { body: next.body } : undefined);
}

export function notifyOutcome(outcome: SettledOutcome, feedback: OutcomeFeedback): void {
  show(outcomeToast(outcome, feedback));
}

export interface CommandNotice {
  commandType: string;
  outcome: 'rejected' | 'superseded' | 'failed';
  code: string | null;
}

export function noticeToast(notice: CommandNotice): OutcomeToast {
  const label = commandLabel(notice.commandType);
  if (notice.outcome === 'superseded') return { intent: 'warning', title: `${label} — changed on another device: ${SUPERSEDED_FALLBACK}` };
  if (notice.outcome === 'failed') return { intent: 'danger', title: `${label} — not saved: ${failureCopy(notice.code)}` };
  return { intent: 'warning', title: `${label} — not saved: ${rejectionCopy(notice.code)}` };
}

export function notifyNotice(notice: CommandNotice): void {
  show(noticeToast(notice));
}
