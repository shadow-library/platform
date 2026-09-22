import { describe, expect, it } from 'bun:test';
import { ApiError } from '@shadow-library/web';

import { commandErrorCopy, commandRefusal, isDeadLetterCode, noticeToast, outcomeToast, refusedCopy, rejectionCopy, toCommandError } from '@/lib/data';

describe('command feedback copy', () => {
  it('should map known error codes to owner copy', () => {
    expect(commandErrorCopy('QST_006', 'fallback')).toBe('Entries older than 7 days can’t be changed.');
    expect(rejectionCopy('FIN_003')).toBe('That expense no longer exists.');
    expect(rejectionCopy(null, { kind: 'reschedule-cap' })).toBe('It has already been moved twice this week.');
  });

  it('should never surface the server’s own message', () => {
    const raw = new ApiError(500, { code: 'S999', type: 'Internal', message: 'Unknown Error' });

    expect(rejectionCopy('WHAT_001')).toBe('The server didn’t accept this change.');
    expect(commandRefusal(raw, 'That could not be started.')).toEqual({ status: 'rejected', message: 'That could not be started.', error: { code: 'S999', kind: 'unavailable' } });
    expect(commandRefusal(new TypeError('Failed to fetch'), 'That could not be started.')).toMatchObject({
      message: 'Couldn’t reach Memoir.',
      error: { kind: 'unavailable' },
    });
  });

  it('should dead-letter every failure except the transient codes', () => {
    expect(isDeadLetterCode('QST_003')).toBe(true);
    expect(isDeadLetterCode('VALIDATION_ERROR')).toBe(true);
    expect(isDeadLetterCode('SYN_409')).toBe(true);
    expect(isDeadLetterCode(null)).toBe(true);
    expect(isDeadLetterCode('S007')).toBe(false);
    expect(isDeadLetterCode('OCR_002')).toBe(false);
    expect(isDeadLetterCode('ACC_002')).toBe(false);
  });

  it('should take a listed code’s kind from the catalogue rather than the HTTP status', () => {
    expect(toCommandError(new ApiError(403, { code: 'ACC_002', type: 'Forbidden', message: 'deleting' }))).toEqual({ code: 'ACC_002', kind: 'unavailable' });
    expect(toCommandError(new ApiError(409, { code: 'NEW_001', type: 'Conflict', message: 'new' }))).toEqual({ code: 'NEW_001', kind: 'refusal' });
  });

  it('should use neutral copy for a closed store rather than blaming another account', () => {
    expect(refusedCopy('closed')).toBe('The app was reloading its data. Try again.');
    expect(refusedCopy('owner-changed')).toContain('different account');
    expect(outcomeToast({ status: 'refused', message: refusedCopy('closed'), boundary: 'closed' }, { success: '', action: 'save' })?.title).toBe(
      'Couldn’t save — undone: The app was reloading its data. Try again.',
    );
  });

  it('should name the subject and pick the tone for every outcome', () => {
    const feedback = { success: 'Evening stretch completed. +8 XP.', action: 'complete', subject: 'Evening stretch' };

    expect(outcomeToast({ status: 'applied', local: null, xpAwarded: 8, coinsAwarded: 0 }, feedback)).toEqual({ intent: 'success', title: 'Evening stretch completed. +8 XP.' });
    expect(outcomeToast({ status: 'rejected', message: 'Entries older than 7 days can’t be changed.', code: 'QST_006', undone: true }, feedback)).toEqual({
      intent: 'warning',
      title: 'Couldn’t complete ‘Evening stretch’ — undone: Entries older than 7 days can’t be changed.',
    });
    expect(outcomeToast({ status: 'rejected', message: 'That setting can’t be changed.', code: 'ACC_004', undone: false }, feedback)).toEqual({
      intent: 'warning',
      title: 'Couldn’t complete ‘Evening stretch’: That setting can’t be changed.',
    });
    expect(outcomeToast({ status: 'failed', message: 'Something went wrong on our side.', code: null, undone: true }, feedback)).toEqual({
      intent: 'danger',
      title: 'Couldn’t complete ‘Evening stretch’ — undone: Something went wrong on our side.',
    });
    expect(outcomeToast({ status: 'failed', message: 'Couldn’t reach Memoir.', code: 'NETWORK', undone: false }, feedback)?.title).toBe(
      'Couldn’t complete ‘Evening stretch’: Couldn’t reach Memoir.',
    );
    expect(outcomeToast({ status: 'queued-offline', local: null, reason: 'deletion' }, feedback)).toMatchObject({
      intent: 'neutral',
      title: 'Saved on this device — this account is being deleted.',
    });
    expect(outcomeToast({ status: 'superseded', message: 'Another device already recorded it as skipped.' }, feedback)).toEqual({
      intent: 'warning',
      title: '‘Evening stretch’ changed on another device: Another device already recorded it as skipped.',
    });
    expect(outcomeToast({ status: 'queued-offline', local: null, reason: 'offline' }, feedback)).toMatchObject({ intent: 'neutral', title: 'Saved on this device — will sync.' });
    expect(outcomeToast({ status: 'queued-offline', local: null, reason: 'held' }, feedback)).toMatchObject({ intent: 'neutral', title: 'Saved on this device — will sync.' });
    expect(outcomeToast({ status: 'queued-offline', local: null, reason: 'slow' }, feedback)).toMatchObject({ intent: 'neutral', title: 'Saved — syncing.' });
  });

  it('should label a notice by the kind of change it was', () => {
    expect(noticeToast({ commandType: 'expense.create', outcome: 'rejected', code: 'FIN_003' })).toEqual({
      intent: 'warning',
      title: 'Expense — not saved: That expense no longer exists.',
    });
  });
});
