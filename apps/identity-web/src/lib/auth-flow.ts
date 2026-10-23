import { type ApiError, type FlowState } from './apis';

export type DeadReason = 'expired' | 'locked';

export type FlowFailureOutcome = { kind: 'dead'; reason: DeadReason } | { kind: 'error'; message: string };

type FlowFailure = Pick<ApiError, 'status' | 'code' | 'message' | 'fields' | 'retryAfterSeconds'>;

const UNKNOWN_FAILURE_MESSAGE = 'Something went wrong. Please try again.';

const RETRY_MESSAGE = (seconds?: number): string => (seconds ? `Too many attempts — try again in ${seconds}s.` : 'Too many attempts — try again shortly.');

const REJECTED_MESSAGE = (attemptsLeft: number): string =>
  attemptsLeft > 0 ? `That didn’t work — ${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left.` : 'No attempts left. This attempt is locked.';

const ACCOUNT_STATE_MESSAGES: Record<string, string> = {
  AUTH_008: 'We couldn’t find an account with those details. Check them, or create an account.',
  AUTH_009: 'This account has been blocked. Contact support if you believe this is a mistake.',
  AUTH_010: 'This account is temporarily suspended. Contact your administrator to restore access.',
  AUTH_011: 'This account has been deactivated. Contact your administrator to reactivate it.',
};

export function rejectedProofMessage(previous: FlowState | null, next: FlowState): string | null {
  if (previous && previous.status === next.status && next.attemptsLeft !== undefined) return REJECTED_MESSAGE(next.attemptsLeft);
  return null;
}

export function flowFailureOutcome(failure: FlowFailure | null): FlowFailureOutcome {
  if (!failure) return { kind: 'error', message: UNKNOWN_FAILURE_MESSAGE };
  if (failure.status === 410 || failure.status === 409) return { kind: 'dead', reason: failure.code === 'AUTH_004' ? 'locked' : 'expired' };
  const accountState = failure.code && Object.hasOwn(ACCOUNT_STATE_MESSAGES, failure.code) ? ACCOUNT_STATE_MESSAGES[failure.code] : undefined;
  if (accountState) return { kind: 'error', message: accountState };
  if (failure.status === 429) return { kind: 'error', message: RETRY_MESSAGE(failure.retryAfterSeconds) };
  if (failure.fields?.length) return { kind: 'error', message: failure.fields.map(field => field.msg).join(' ') };
  return { kind: 'error', message: failure.message };
}
