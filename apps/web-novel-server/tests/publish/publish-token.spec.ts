import { describe, expect, it } from 'bun:test';

import { nextPublishToken } from '@modules/publish/publish-token';

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);

describe('nextPublishToken', () => {
  it('should bind an incoming token on first sight for a legacy or new novel', () => {
    expect(nextPublishToken(null, TOKEN_A)).toEqual({ token: TOKEN_A, mismatch: false });
  });

  it('should accept a push whose token matches the bound one', () => {
    expect(nextPublishToken(TOKEN_A, TOKEN_A)).toEqual({ token: TOKEN_A, mismatch: false });
  });

  it('should flag a mismatch when a bound novel receives a different token', () => {
    expect(nextPublishToken(TOKEN_A, TOKEN_B)).toEqual({ token: TOKEN_A, mismatch: true });
  });

  it('should keep the bound token when a push carries none (wire-compatible rollout)', () => {
    expect(nextPublishToken(TOKEN_A, undefined)).toEqual({ token: TOKEN_A, mismatch: false });
    expect(nextPublishToken(TOKEN_A, null)).toEqual({ token: TOKEN_A, mismatch: false });
  });

  it('should bind nothing when neither side carries a token', () => {
    expect(nextPublishToken(null, undefined)).toEqual({ token: null, mismatch: false });
    expect(nextPublishToken(null, null)).toEqual({ token: null, mismatch: false });
  });
});
