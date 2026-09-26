import { describe, expect, it } from 'bun:test';

import { isFinalizeBlocked, isIsolated } from '../src/lib/apis/interstitial.api';

describe('isIsolated', () => {
  it('should read the flag straight off the draft', () => {
    expect(isIsolated({ isolated: true })).toBe(true);
    expect(isIsolated({ isolated: false })).toBe(false);
  });
});

describe('isFinalizeBlocked', () => {
  it('should block a non-isolated draft with no summary', () => {
    expect(isFinalizeBlocked({ isolated: false, summary: null, state: {} })).toBe(true);
    expect(isFinalizeBlocked({ isolated: false, summary: '   ', state: {} })).toBe(true);
  });

  it('should not block a non-isolated draft that has a summary, regardless of state', () => {
    expect(isFinalizeBlocked({ isolated: false, summary: 'The keeper counted twice.', state: null })).toBe(false);
    expect(isFinalizeBlocked({ isolated: false, summary: 'The keeper counted twice.', state: {} })).toBe(false);
  });

  it('should block an isolated draft missing its summary before ever checking state', () => {
    expect(isFinalizeBlocked({ isolated: true, summary: null, state: { lastBeat: 'x' } })).toBe(true);
  });

  it('should block an isolated draft with a summary but no continuation state', () => {
    expect(isFinalizeBlocked({ isolated: true, summary: 'Bridge summary.', state: null })).toBe(true);
    expect(isFinalizeBlocked({ isolated: true, summary: 'Bridge summary.', state: {} })).toBe(true);
  });

  it('should pass an isolated draft with both a summary and continuation state', () => {
    expect(isFinalizeBlocked({ isolated: true, summary: 'Bridge summary.', state: { lastBeat: 'x' } })).toBe(false);
  });
});
