import { describe, expect, it } from 'bun:test';

import { type FlowState } from '../src/lib/apis';
import { flowFailureOutcome, rejectedProofMessage } from '../src/lib/auth-flow';

const flow = (status: string, attemptsLeft?: number): FlowState => ({ flowId: 'f1', status, attemptsLeft });

describe('rejectedProofMessage', () => {
  it('should return null for the first response of a flow', () => {
    expect(rejectedProofMessage(null, flow('password', 3))).toBeNull();
  });

  it('should return null when the status changes', () => {
    expect(rejectedProofMessage(flow('identifier'), flow('password', 3))).toBeNull();
  });

  it('should return null for a same-status answer without an attempts budget', () => {
    expect(rejectedProofMessage(flow('password'), flow('password'))).toBeNull();
  });

  it('should use the plural form for several attempts left', () => {
    expect(rejectedProofMessage(flow('password', 5), flow('password', 4))).toBe('That didn’t work — 4 attempts left.');
  });

  it('should use the singular form for one attempt left', () => {
    expect(rejectedProofMessage(flow('password', 2), flow('password', 1))).toBe('That didn’t work — 1 attempt left.');
  });

  it('should announce the lock when no attempts are left', () => {
    expect(rejectedProofMessage(flow('password', 1), flow('password', 0))).toBe('No attempts left. This attempt is locked.');
  });
});

describe('flowFailureOutcome', () => {
  const failure = (overrides: Record<string, unknown> = {}) =>
    ({ status: 400, code: 'GEN_001', message: 'server message', ...overrides }) as Parameters<typeof flowFailureOutcome>[0];

  it('should return the generic message for a non-API failure', () => {
    expect(flowFailureOutcome(null)).toEqual({ kind: 'error', message: 'Something went wrong. Please try again.' });
  });

  it('should mark 410 as expired', () => {
    expect(flowFailureOutcome(failure({ status: 410 }))).toEqual({ kind: 'dead', reason: 'expired' });
  });

  it('should mark 409 as expired', () => {
    expect(flowFailureOutcome(failure({ status: 409 }))).toEqual({ kind: 'dead', reason: 'expired' });
  });

  it('should mark AUTH_004 on 410 or 409 as locked', () => {
    expect(flowFailureOutcome(failure({ status: 410, code: 'AUTH_004' }))).toEqual({ kind: 'dead', reason: 'locked' });
    expect(flowFailureOutcome(failure({ status: 409, code: 'AUTH_004' }))).toEqual({ kind: 'dead', reason: 'locked' });
  });

  it('should not treat AUTH_004 on other statuses as dead', () => {
    expect(flowFailureOutcome(failure({ status: 400, code: 'AUTH_004' }))).toEqual({ kind: 'error', message: 'server message' });
  });

  it('should let dead statuses win over account-state codes', () => {
    expect(flowFailureOutcome(failure({ status: 409, code: 'AUTH_009' }))).toEqual({ kind: 'dead', reason: 'expired' });
  });

  it.each([
    ['AUTH_008', 'We couldn’t find an account with those details. Check them, or create an account.'],
    ['AUTH_009', 'This account has been blocked. Contact support if you believe this is a mistake.'],
    ['AUTH_010', 'This account is temporarily suspended. Contact your administrator to restore access.'],
    ['AUTH_011', 'This account has been deactivated. Contact your administrator to reactivate it.'],
  ])('should map account-state code %s', (code, message) => {
    expect(flowFailureOutcome(failure({ code }))).toEqual({ kind: 'error', message });
  });

  it('should let account-state codes win over rate limiting and field errors', () => {
    const outcome = flowFailureOutcome(failure({ status: 429, code: 'AUTH_008', fields: [{ field: 'a', msg: 'bad' }] }));
    expect(outcome).toEqual({ kind: 'error', message: 'We couldn’t find an account with those details. Check them, or create an account.' });
  });

  it('should include the retry delay on 429', () => {
    expect(flowFailureOutcome(failure({ status: 429, retryAfterSeconds: 30 }))).toEqual({ kind: 'error', message: 'Too many attempts — try again in 30s.' });
  });

  it('should omit the delay on 429 when absent or zero', () => {
    expect(flowFailureOutcome(failure({ status: 429 }))).toEqual({ kind: 'error', message: 'Too many attempts — try again shortly.' });
    expect(flowFailureOutcome(failure({ status: 429, retryAfterSeconds: 0 }))).toEqual({ kind: 'error', message: 'Too many attempts — try again shortly.' });
  });

  it('should prefer 429 copy over field errors', () => {
    const outcome = flowFailureOutcome(failure({ status: 429, fields: [{ field: 'a', msg: 'bad' }] }));
    expect(outcome).toEqual({ kind: 'error', message: 'Too many attempts — try again shortly.' });
  });

  it('should join field messages with a space', () => {
    const fields = [
      { field: 'a', msg: 'First.' },
      { field: 'b', msg: 'Second.' },
    ];
    expect(flowFailureOutcome(failure({ status: 422, fields }))).toEqual({ kind: 'error', message: 'First. Second.' });
  });

  it('should fall through to the message for empty or null fields', () => {
    expect(flowFailureOutcome(failure({ fields: [] }))).toEqual({ kind: 'error', message: 'server message' });
    expect(flowFailureOutcome(failure({ fields: null }))).toEqual({ kind: 'error', message: 'server message' });
  });

  it('should fall through to the message for an unknown code', () => {
    expect(flowFailureOutcome(failure({ code: 'AUTH_999' }))).toEqual({ kind: 'error', message: 'server message' });
  });

  it.each(['constructor', 'toString', '__proto__'])('should not treat prototype key %s as an account-state code', code => {
    expect(flowFailureOutcome(failure({ code }))).toEqual({ kind: 'error', message: 'server message' });
  });

  it('should ignore a missing code', () => {
    expect(flowFailureOutcome(failure({ code: undefined }))).toEqual({ kind: 'error', message: 'server message' });
    expect(flowFailureOutcome(failure({ code: '' }))).toEqual({ kind: 'error', message: 'server message' });
  });
});
