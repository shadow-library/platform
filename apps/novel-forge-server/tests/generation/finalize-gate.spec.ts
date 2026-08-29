import { describe, expect, it } from 'bun:test';

import { isFinalizable } from '@server/common';

describe('isFinalizable', () => {
  it('passes an isolated draft with both a summary and a non-empty state', () => {
    expect(isFinalizable({ isolated: true, summary: 'Ash fled the tower.', state: { lastBeat: 'Ash jumps' } })).toBe(true);
  });

  it('refuses an isolated draft missing its summary', () => {
    expect(isFinalizable({ isolated: true, summary: null, state: { lastBeat: 'Ash jumps' } })).toBe(false);
    expect(isFinalizable({ isolated: true, summary: undefined, state: { lastBeat: 'Ash jumps' } })).toBe(false);
    expect(isFinalizable({ isolated: true, summary: '', state: { lastBeat: 'Ash jumps' } })).toBe(false);
  });

  it('refuses an isolated draft whose summary is whitespace-only', () => {
    expect(isFinalizable({ isolated: true, summary: '   \n\t', state: { lastBeat: 'Ash jumps' } })).toBe(false);
  });

  it('refuses an isolated draft missing its continuation state', () => {
    expect(isFinalizable({ isolated: true, summary: 'Ash fled the tower.', state: null })).toBe(false);
    expect(isFinalizable({ isolated: true, summary: 'Ash fled the tower.', state: undefined })).toBe(false);
  });

  it('refuses an isolated draft whose continuation state is an empty object', () => {
    expect(isFinalizable({ isolated: true, summary: 'Ash fled the tower.', state: {} })).toBe(false);
  });

  it('refuses an isolated draft missing both fields', () => {
    expect(isFinalizable({ isolated: true, summary: null, state: null })).toBe(false);
  });

  it('never gates a non-isolated draft, even missing both fields', () => {
    expect(isFinalizable({ isolated: false, summary: null, state: null })).toBe(true);
    expect(isFinalizable({ isolated: false, summary: '', state: {} })).toBe(true);
  });
});
