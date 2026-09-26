import { describe, expect, it } from 'bun:test';

import { type KnowledgeEntryResponse } from '../src/lib/apis/api-types.gen';
import { ladderFacts, ladderRungs, rungChip, type RungFact, rungLine, rungState, truthShownPlainly, unlockSummary } from '../src/lib/power-ladder';
import { type UnlockLookup } from '../src/lib/secret-states';

function learned(learnedInChapter: number, status: KnowledgeEntryResponse['status'] = 'committed'): KnowledgeEntryResponse {
  return { entityKey: 'tamsin', entityName: 'Tamsin', learnedInChapter, status, source: 'manual', createdAt: '2026-09-01T00:00:00Z' };
}

function rung(factKey: string, overrides: Partial<RungFact> = {}): RungFact {
  return { factKey, subjects: ['lamp_ranks'], knowledge: [], ...overrides };
}

const lookup: UnlockLookup = {
  milestones: new Map([
    ['reaches_lantern', { milestoneKey: 'reaches_lantern', label: 'Tamsin reaches Lantern', state: 'reached', reachedChapter: 64 }],
    ['reads_margins', { milestoneKey: 'reads_margins', label: 'Tamsin reads the margins', state: 'open' }],
  ]),
  volumes: new Map([['v3', { volumeKey: 'v3', ordinal: 3, title: null, state: 'not_started' }]]),
  nextChapter: 87,
  status: 'ready',
};

const facts: RungFact[] = [
  rung('rank_10_keeper'),
  rung('rank_2_taper', { knowledge: [learned(11)] }),
  rung('rank_4_beacon', { plannedChapter: 87, unlock: { all: [{ milestone: 'reaches_lantern' }] } }),
  rung('rank_5_lighthouse', { unlock: { all: [{ volume: 'v3' }, { milestone: 'reaches_lantern' }] } }),
  rung('unrelated', { subjects: ['someone_else'] }),
];

describe('ladderFacts', () => {
  it('should keep the rule’s own facts in natural key order', () => {
    expect(ladderFacts(facts, 'lamp_ranks').map(fact => fact.factKey)).toEqual(['rank_2_taper', 'rank_4_beacon', 'rank_5_lighthouse', 'rank_10_keeper']);
  });
});

describe('rungState', () => {
  it('should read known, planned and locked apart, counting the conditions already met', () => {
    const [taper, beacon, lighthouse, keeper] = ladderFacts(facts, 'lamp_ranks');
    expect(rungState(taper!, lookup)).toEqual({ kind: 'known', chapter: 11, provisional: false });
    expect(rungState(beacon!, lookup)).toEqual({ kind: 'planned', chapter: 87 });
    expect(rungState(lighthouse!, lookup)).toEqual({ kind: 'locked', met: 1, total: 2, dated: undefined });
    expect(rungState(keeper!, lookup)).toEqual({ kind: 'locked', met: 0, total: 0, dated: undefined });
  });

  it('should date known-since from committed knowledge and stay provisional while only unfinalized chapters hold it', () => {
    expect(rungState(rung('x', { knowledge: [learned(4, 'provisional')] }), lookup)).toEqual({ kind: 'known', chapter: 4, provisional: true });
    expect(rungState(rung('x', { knowledge: [learned(4, 'provisional'), learned(9)] }), lookup)).toEqual({ kind: 'known', chapter: 9, provisional: false });
  });
});

describe('rungChip', () => {
  it('should label every state', () => {
    expect(rungChip({ kind: 'known', chapter: 11, provisional: false })).toEqual({ chip: 'Known since ch 11', intent: 'success' });
    expect(rungChip({ kind: 'known', chapter: 4, provisional: true }).chip).toBe('Known from ch 4 · provisional');
    expect(rungChip({ kind: 'planned', chapter: 87 })).toEqual({ chip: 'Planned for ch 87 · provisional', intent: 'accent' });
    expect(rungChip({ kind: 'locked', met: 0, total: 2, dated: undefined }).chip).toBe('Locked · 0 of 2 conditions');
    expect(rungChip({ kind: 'locked', met: 0, total: 0, dated: 30 }).chip).toBe('Locked · until ch 30');
    expect(rungChip({ kind: 'locked', met: 0, total: 0, dated: undefined }).chip).toBe('Locked · no unlock set');
  });
});

describe('ladderRungs', () => {
  it('should number rungs by ladder position', () => {
    const ordered = ladderFacts(facts, 'lamp_ranks');
    expect(ladderRungs(ordered, lookup).map(item => [item.n, item.name, item.chip])).toEqual([
      [1, 'Rank 2 taper', 'Known since ch 11'],
      [2, 'Rank 4 beacon', 'Planned for ch 87 · provisional'],
      [3, 'Rank 5 lighthouse', 'Locked · 1 of 2 conditions'],
      [4, 'Rank 10 keeper', 'Locked · no unlock set'],
    ]);
  });
});

describe('truth on the ladder', () => {
  it('should print a rung’s truth only once readers have been shown it, not when a character merely knows it', () => {
    const known = { ...rung('x', { knowledge: [learned(3)], writerNote: 'Hollis refuses to say.' }), text: 'THE TRUTH' };
    expect(truthShownPlainly(known)).toBe(false);
    expect(rungLine(known)).not.toContain('THE TRUTH');
    expect(rungLine({ ...known, knowledge: [], disclosedInChapter: null })).toBe('Hollis refuses to say.');
    expect(rungLine({ ...known, disclosedInChapter: 3 })).toBe('THE TRUTH');
  });
});

describe('unlockSummary', () => {
  it('should explain each state without implying rungs unlock in a chain', () => {
    expect(unlockSummary({ kind: 'known', chapter: 2, provisional: false })).toBe('Open since chapter 2.');
    expect(unlockSummary({ kind: 'planned', chapter: 87 })).toContain('provisional until you finalize');
    expect(unlockSummary({ kind: 'locked', met: 0, total: 2, dated: undefined })).toBe('All must hold, in any order. Opening another rung doesn’t open this one.');
    expect(unlockSummary({ kind: 'locked', met: 0, total: 0, dated: undefined })).toBe('No conditions and no date — no chapter plan may reveal it.');
  });
});
