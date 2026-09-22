import { describe, expect, it } from 'bun:test';

import { mergeStartChips, restoreStartChips } from '../src/features/blueprint/start-step';
import { type LedgerEntryResponse } from '../src/lib/apis';

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: '1',
    projectId: '7',
    kind: 'direction',
    phase: 'idea',
    topic: 'start',
    statement: 'A ferry that only runs at dusk',
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    stepKey: 'start',
    payload: { kind: 'element', optionId: 'c1' },
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('restoreStartChips', () => {
  it('should read every saved chip back, ruled-out ones included', () => {
    expect(
      restoreStartChips([
        entry(),
        entry({ id: '2', topic: 'start', statement: 'Found family', payload: { kind: 'want' } }),
        entry({ id: '3', kind: 'rejected', topic: 'start.ruled_out', statement: 'No chosen-one prophecy', payload: { kind: 'not', optionId: 'c3' } }),
      ]),
    ).toEqual([
      { optionId: 'c1', label: 'A ferry that only runs at dusk', kind: 'element' },
      { label: 'Found family', kind: 'want' },
      { optionId: 'c3', label: 'No chosen-one prophecy', kind: 'not' },
    ]);
  });

  it('should fall back to the topic when the payload says nothing useful', () => {
    expect(restoreStartChips([entry({ kind: 'rejected', topic: 'start.ruled_out', payload: null })])[0]?.kind).toBe('not');
    expect(restoreStartChips([entry({ payload: {} })])[0]?.kind).toBe('element');
  });

  it('should ignore an entry from another topic', () => {
    expect(restoreStartChips([entry({ topic: 'start.steer' })])).toEqual([]);
  });
});

describe('mergeStartChips', () => {
  const fromRound = [
    { optionId: 'c1', label: 'A ferry that only runs at night', kind: 'element' as const },
    { optionId: 'c2', label: 'Quiet dread', kind: 'want' as const },
  ];
  const saved = [
    { optionId: 'c1', label: 'A ferry that only runs at dusk', kind: 'element' as const },
    { label: 'Found family', kind: 'want' as const },
  ];

  it('should put an edited label back on the round it was saved against', () => {
    expect(mergeStartChips(fromRound, saved, true)).toEqual([
      { optionId: 'c1', label: 'A ferry that only runs at dusk', kind: 'element' },
      { optionId: 'c2', label: 'Quiet dread', kind: 'want' },
      { label: 'Found family', kind: 'want' },
    ]);
  });

  it('should leave a fresh reading’s own labels alone and still carry the author’s own chips', () => {
    expect(mergeStartChips(fromRound, saved, false)).toEqual([...fromRound, { label: 'Found family', kind: 'want' }]);
  });

  it('should not add a chip the reading already says', () => {
    expect(mergeStartChips(fromRound, [{ label: '  quiet dread  ', kind: 'want' }], false)).toEqual(fromRound);
  });
});
