import { describe, expect, it } from 'bun:test';

import { continuityCaption, continuityHasHeldEntries, continuityHighlights } from '../src/lib/continuity-proposal';

describe('continuityHighlights', () => {
  it('should name what each non-empty field adds and skip the empty ones', () => {
    const highlights = continuityHighlights({
      newEntities: [{ entityKey: 'mira', name: 'Mira', type: 'character' }],
      threads: [],
      mysteries: [{ mysteryKey: 'tide', status: 'open' }],
      relationships: [{ entityKey: 'mira', targetKey: 'bram', kind: 'ally' }],
    });

    expect(highlights).toEqual([
      { label: 'New entries', count: 1, items: ['Mira'], more: 0 },
      { label: 'Mysteries', count: 1, items: ['tide'], more: 0 },
      { label: 'Relationships', count: 1, items: ['mira and bram'], more: 0 },
    ]);
  });

  it('should list at most three names and count the rest', () => {
    const timeline = ['a', 'b', 'c', 'd', 'e'].map(event => ({ event }));

    expect(continuityHighlights({ timeline })).toEqual([{ label: 'Timeline', count: 5, items: ['a', 'b', 'c'], more: 2 }]);
  });

  it('should keep the count when an entry carries no name', () => {
    expect(continuityHighlights({ power: [{ stage: 'adept' }] })).toEqual([{ label: 'Power', count: 1, items: [], more: 0 }]);
  });

  it('should return nothing for an empty finding', () => {
    expect(continuityHighlights({})).toEqual([]);
  });
});

describe('continuityCaption', () => {
  it('should count every list field across the finding', () => {
    expect(continuityCaption({ threads: [{ threadKey: 't1', status: 'open' }], mysteries: [], characterStates: [{ entityKey: 'e1' }] })).toBe('2 continuity updates');
  });

  it('should singularise a single update', () => {
    expect(continuityCaption({ threads: [{ threadKey: 't1', status: 'open' }] })).toBe('1 continuity update');
  });

  it('should flag a low-confidence entry as needing another look', () => {
    expect(continuityCaption({ threads: [{ threadKey: 't1', status: 'open', confidence: 'low' }] })).toBe('1 continuity update · needs a closer look');
  });

  it('should report zero updates for an empty finding without a trailing separator', () => {
    expect(continuityCaption({})).toBe('0 continuity updates');
  });
});

describe('continuityHasHeldEntries', () => {
  it('should detect a low-confidence entry on any confidence-bearing field', () => {
    expect(continuityHasHeldEntries({ relationships: [{ entityKey: 'a', targetKey: 'b', kind: 'ally', confidence: 'low' }] })).toBe(true);
  });

  it('should ignore a high-confidence or absent confidence', () => {
    expect(continuityHasHeldEntries({ threads: [{ threadKey: 't1', status: 'open', confidence: 'high' }] })).toBe(false);
    expect(continuityHasHeldEntries({ threads: [{ threadKey: 't1', status: 'open' }] })).toBe(false);
    expect(continuityHasHeldEntries({})).toBe(false);
  });
});
