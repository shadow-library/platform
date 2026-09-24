import { describe, expect, it } from 'bun:test';

import { ledgerTopicLabel } from '../src/features/blueprint/notebook';
import {
  countWords,
  mergeStartChips,
  restoreStartChips,
  START_TEXT_MAX,
  START_WORD_MAX,
  startTextLength,
  startTextMeter,
  startTextStatus,
} from '../src/features/blueprint/start-step';
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
  it('should read every saved chip back, ruled-out and later ones included', () => {
    expect(
      restoreStartChips([
        entry(),
        entry({ id: '2', topic: 'start', statement: 'Found family', payload: { kind: 'want' } }),
        entry({ id: '3', kind: 'rejected', topic: 'start.ruled_out', statement: 'No chosen-one prophecy', payload: { kind: 'not', optionId: 'c3' } }),
        entry({ id: '4', kind: 'backlog', topic: 'start.later', statement: 'Ending: the debt is finally paid', payload: { kind: 'later', optionId: 'c4' } }),
      ]),
    ).toEqual([
      { optionId: 'c1', label: 'A ferry that only runs at dusk', kind: 'element' },
      { localId: 'ledger:2', label: 'Found family', kind: 'want' },
      { optionId: 'c3', label: 'No chosen-one prophecy', kind: 'not' },
      { optionId: 'c4', label: 'Ending: the debt is finally paid', kind: 'later' },
    ]);
  });

  it('should fall back to the topic when the payload says nothing useful', () => {
    expect(restoreStartChips([entry({ kind: 'rejected', topic: 'start.ruled_out', payload: null })])[0]?.kind).toBe('not');
    expect(restoreStartChips([entry({ kind: 'backlog', topic: 'start.later', payload: null })])[0]?.kind).toBe('later');
    expect(restoreStartChips([entry({ payload: {} })])[0]?.kind).toBe('element');
  });

  it('should ignore an entry from another topic', () => {
    expect(restoreStartChips([entry({ topic: 'start.steer' })])).toEqual([]);
  });

  it('should derive an author-added chip’s id from the ledger entry rather than minting one', () => {
    expect(restoreStartChips([entry({ id: 'e-9', payload: { kind: 'element' } })])[0]?.localId).toBe('ledger:e-9');
    expect(restoreStartChips([entry({ id: 'e-9', payload: { kind: 'element' } })])[0]?.localId).toBe(
      restoreStartChips([entry({ id: 'e-9', payload: { kind: 'element' } })])[0]?.localId,
    );
  });

  it('should not set a localId on a chip the round still offers by option id', () => {
    expect(restoreStartChips([entry()])[0]).not.toHaveProperty('localId');
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

  it('should carry a later chip the round no longer offers back onto a fresh reading', () => {
    const savedLater = [{ label: 'Ending: the debt is finally paid', kind: 'later' as const }];
    expect(mergeStartChips(fromRound, savedLater, false)).toEqual([...fromRound, ...savedLater]);
  });
});

describe('startTextLength', () => {
  it('should count what is sent, by code point, as the server does', () => {
    expect(startTextLength('  a ferry at dusk \n')).toBe(15);
    expect(startTextLength('dusk — 🌒')).toBe(8);
  });

  it('should let a full-length starting text through and flag one character more', () => {
    expect(startTextLength('a'.repeat(START_TEXT_MAX))).toBeLessThanOrEqual(START_TEXT_MAX);
    expect(startTextLength('a'.repeat(START_TEXT_MAX + 1))).toBeGreaterThan(START_TEXT_MAX);
  });
});

describe('startTextStatus', () => {
  const words = (count: number): string => Array.from({ length: count }, () => 'tide').join(' ');

  it('should count words across any whitespace', () => {
    expect(countWords('  a ferry\n\nat   dusk\t ')).toBe(4);
    expect(countWords('   ')).toBe(0);
  });

  it('should say how many words are left, and warn in the last tenth', () => {
    expect(startTextStatus(words(1))).toEqual({ state: 'ok', words: 1 });
    expect(startTextMeter(startTextStatus(words(1)))).toBe('1 word · 9,999 left');
    expect(startTextStatus(words(START_WORD_MAX * 0.9)).state).toBe('near');
    expect(startTextStatus(words(START_WORD_MAX))).toEqual({ state: 'near', words: START_WORD_MAX });
  });

  it('should refuse one word past the limit and say by how much', () => {
    const status = startTextStatus(words(START_WORD_MAX + 12));
    expect(status).toEqual({ state: 'over', words: START_WORD_MAX + 12, reason: 'words' });
    expect(startTextMeter(status)).toStartWith('10,012 words, 12 over the 10,000-word limit.');
  });

  it('should refuse a text past the character ceiling even with few words', () => {
    expect(startTextStatus('a'.repeat(START_TEXT_MAX + 1))).toEqual({ state: 'over', words: 1, reason: 'characters' });
  });
});

describe('ledgerTopicLabel', () => {
  it('should name the kept starting text for the author', () => {
    expect(ledgerTopicLabel('start.brief')).toBe('Your starting text');
  });

  it('should name the later-placed backlog topic for the author', () => {
    expect(ledgerTopicLabel('start.later')).toBe('Later in the story');
  });
});
