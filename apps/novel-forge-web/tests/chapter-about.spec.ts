import { describe, expect, it } from 'bun:test';

import { type FinalizeReviewItemResponse } from '../src/lib/apis';
import { aboutSections, aboutUpdatesNote, whoAppears } from '../src/lib/chapter-about';

function item(overrides: Partial<FinalizeReviewItemResponse>): FinalizeReviewItemResponse {
  return {
    id: 'i1',
    category: 'character_state',
    triage: 'routine',
    basis: 'observed',
    subjectKey: 'tamsin',
    claim: 'Tamsin ends on the harbour wall.',
    proposed: {},
    autoKept: false,
    ...overrides,
  };
}

describe('whoAppears', () => {
  it('should list each point of view with the scenes the plan gives them', () => {
    const brief = { pov: 'tamsin', scenes: [{ summary: 'a' }, { summary: 'b', pov: 'hollis' }, { summary: 'c' }, { summary: 'd', pov: 'tamsin' }] };
    expect(whoAppears(brief, new Map([['tamsin', 'Tamsin']]))).toEqual([
      { key: 'tamsin', name: 'Tamsin', role: 'point of view, scenes 1, 3, 4' },
      { key: 'hollis', name: 'hollis', role: 'point of view, scene 2' },
    ]);
  });

  it('should fall back to the chapter’s point of view, and to nobody without a plan', () => {
    expect(whoAppears({ pov: 'tamsin', scenes: null }, new Map())).toEqual([{ key: 'tamsin', name: 'tamsin', role: 'point of view' }]);
    expect(whoAppears(undefined, new Map())).toEqual([]);
  });
});

describe('aboutSections', () => {
  it('should group the Story Bible updates as the canvas does, skipping what the author skipped', () => {
    const sections = aboutSections({
      consequential: [item({ id: 'k', category: 'knowledge', claim: 'Tamsin learns the Rook line is empty.' })],
      routine: [
        item({ id: 't', category: 'relationship', basis: 'inferred', claim: 'Tamsin trusts Hollis less.' }),
        item({ id: 'w', category: 'entity', claim: 'The ledger is kept in a tin box.' }),
        item({ id: 'p', category: 'promise', claim: 'Opened: who hid Tamsin from the ledger?' }),
        item({ id: 'a', category: 'appearance', claim: 'Hollis appears.' }),
        item({ id: 's', category: 'entity', claim: 'Skipped.', decision: 'skipped' }),
      ],
    });
    expect(sections.map(section => [section.title, section.lines.map(line => [line.text, line.inferred])])).toEqual([
      [
        'What changed for them',
        [
          ['Tamsin learns the Rook line is empty.', false],
          ['Tamsin trusts Hollis less.', true],
        ],
      ],
      ['New in the world', [['The ledger is kept in a tin box.', false]]],
      ['Promises', [['Opened: who hid Tamsin from the ledger?', false]]],
    ]);
  });
});

describe('aboutUpdatesNote', () => {
  it('should call the updates suggestions until finalize keeps them', () => {
    expect(aboutUpdatesNote({ status: 'ready', current: true })).toBe('suggestions');
    expect(aboutUpdatesNote({ status: 'applied', current: true })).toBe('kept');
    expect(aboutUpdatesNote({ status: 'preparing', current: true })).toBe('preparing');
    expect(aboutUpdatesNote({ status: 'ready', current: false })).toBe('unread');
    expect(aboutUpdatesNote(undefined)).toBe('unread');
  });
});
