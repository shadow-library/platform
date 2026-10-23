import { describe, expect, it } from 'bun:test';

import { type ApiError } from '../src/lib/apis';
import { botErrorMessage, botFieldError } from '../src/lib/bot-errors';

const apiError = (code: string, message = 'server message'): ApiError => ({ code, message }) as ApiError;

describe('botErrorMessage', () => {
  it.each(['BOT_001', 'BOT_002', 'BOT_003', 'BOT_004', 'BOT_005', 'BOT_006', 'BOT_007', 'BOT_008', 'BOT_009', 'BOT_010', 'BOT_011', 'BOT_012', 'BOT_013'])(
    'should map %s to curated copy',
    code => {
      const message = botErrorMessage(apiError(code));
      expect(message).not.toBe('server message');
      expect(message.length).toBeGreaterThan(0);
    },
  );

  it('should return the exact copy for a known code', () => {
    expect(botErrorMessage(apiError('BOT_001'))).toBe('This organization has reached its bot limit.');
    expect(botErrorMessage(apiError('BOT_009'))).toBe('This bot no longer exists.');
  });

  it('should fall back to the server message for an unknown code', () => {
    expect(botErrorMessage(apiError('BOT_999', 'boom'))).toBe('boom');
    expect(botErrorMessage(apiError('AUTH_004', 'locked'))).toBe('locked');
  });
});

describe('botErrorMessage prototype keys', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('should fall back to the server message for %s', code => {
    expect(botErrorMessage(apiError(code, 'fallback'))).toBe('fallback');
  });
});

describe('botFieldError', () => {
  it.each(['constructor', 'toString', '__proto__'])('should return null for prototype key %s', code => {
    expect(botFieldError(apiError(code))).toBeNull();
  });

  it.each([
    ['BOT_003', 'handle'],
    ['BOT_012', 'ipAllowlist'],
    ['BOT_007', 'expiresAt'],
    ['BOT_008', 'transferToUserId'],
  ] as const)('should target the field for %s', (code, field) => {
    expect(botFieldError(apiError(code))).toEqual({ field, message: botErrorMessage(apiError(code)) });
  });

  it.each(['BOT_001', 'BOT_004', 'BOT_013', 'BOT_999', ''])('should return null for non-field code %p', code => {
    expect(botFieldError(apiError(code))).toBeNull();
  });
});
