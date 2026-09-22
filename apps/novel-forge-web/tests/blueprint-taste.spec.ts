import { describe, expect, it } from 'bun:test';

import {
  answerPair,
  buildTasteSelection,
  firstUnansweredPair,
  hasTasteAnswer,
  parseTasteRound,
  restoreTasteAnswers,
  type TasteAnswers,
  tasteRoundKey,
  toggleReason,
} from '../src/features/blueprint/taste-step';
import { type BlueprintRoundResponse, type LedgerEntryResponse } from '../src/lib/apis';

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: '1',
    projectId: '7',
    kind: 'direction',
    phase: 'idea',
    topic: 'taste',
    statement: 'slow-burn rise',
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    stepKey: 'taste',
    payload: null,
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function round(overrides: Partial<BlueprintRoundResponse> = {}): BlueprintRoundResponse {
  return {
    id: 'r1',
    stepKey: 'taste',
    round: 1,
    status: 'ready',
    jobId: null,
    steer: null,
    nudges: [],
    keepAsDirection: false,
    feedback: [],
    input: null,
    focus: null,
    options: null,
    coachMessage: null,
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const OPTIONS = {
  pairs: [
    { id: 'p1', a: { text: 'She loses the first three trials', label: 'slow-burn rise' }, b: { text: 'She wins the first trial outright', label: 'early triumph' } },
    { id: 'p2', a: { text: 'The mentor is proven right', label: 'mentor matters' }, b: { text: 'The mentor is proven wrong', label: 'mentor fails' } },
  ],
  giveUpReasons: [{ id: 'r1', label: 'Protagonist never really loses' }],
};

const ready = (): BlueprintRoundResponse => round({ options: OPTIONS });

describe('parseTasteRound', () => {
  it('should read the pairs and give-up reasons a ready round offers', () => {
    const parsed = parseTasteRound(ready());
    expect(parsed.pairs).toHaveLength(2);
    expect(parsed.giveUpReasons).toEqual([{ id: 'r1', label: 'Protagonist never really loses' }]);
  });

  it('should read a round it has no options for as nothing to answer', () => {
    expect(parseTasteRound(round())).toEqual({ pairs: [], giveUpReasons: [] });
    expect(parseTasteRound(null)).toEqual({ pairs: [], giveUpReasons: [] });
  });

  it('should drop a malformed pair rather than render half of one', () => {
    const parsed = parseTasteRound(round({ options: { pairs: [{ id: 'p1', a: { text: 'only one side' } }, 7], giveUpReasons: [{ label: 'no id' }] } }));
    expect(parsed).toEqual({ pairs: [], giveUpReasons: [] });
  });
});

describe('tasteRoundKey', () => {
  it('should change when a round’s options arrive on the round already on screen', () => {
    expect(tasteRoundKey(round())).toBe('r1:pending');
    expect(tasteRoundKey(ready())).toBe('r1:ready');
    expect(tasteRoundKey(null)).toBe('none');
  });
});

describe('answerPair', () => {
  it('should record and take back one pair’s answer', () => {
    const answered = answerPair({}, 'p1', { verdict: 'a' });
    expect(answered).toEqual({ p1: { verdict: 'a' } });
    expect(answerPair(answered, 'p1', null)).toEqual({});
  });
});

describe('toggleReason', () => {
  it('should add and remove a reason', () => {
    expect(toggleReason([], 'r1')).toEqual(['r1']);
    expect(toggleReason(['r1', 'r2'], 'r1')).toEqual(['r2']);
  });
});

describe('firstUnansweredPair', () => {
  it('should open on the first unanswered pair and on the last once they are all answered', () => {
    const parsed = parseTasteRound(ready());
    expect(firstUnansweredPair(parsed.pairs, { p1: { verdict: 'a' } })).toBe(1);
    expect(firstUnansweredPair(parsed.pairs, { p1: { verdict: 'a' }, p2: { verdict: 'b' } })).toBe(1);
    expect(firstUnansweredPair(parsed.pairs, {})).toBe(0);
    expect(firstUnansweredPair([], {})).toBe(0);
  });
});

describe('restoreTasteAnswers', () => {
  it('should read every earlier answer back off the Notebook', () => {
    const restored = restoreTasteAnswers([
      entry({ id: '1', payload: { optionId: 'p1', verdict: 'a' } }),
      entry({ id: '2', payload: { optionId: 'p2', verdict: 'both' }, statement: 'mentor matters and mentor fails' }),
      entry({ id: '3', payload: { optionId: 'p3', verdict: 'depends' }, statement: 'depends on who is watching' }),
    ]);
    expect(restored.answers).toEqual({
      p1: { verdict: 'a' },
      p2: { verdict: 'both' },
      p3: { verdict: 'depends', note: 'depends on who is watching' },
    });
  });

  it('should read a “neither” back from either of the two rejections it wrote', () => {
    const rejected = (side: string) => entry({ id: side, kind: 'rejected', topic: 'taste', payload: { optionId: 'p4', verdict: 'neither', side } });
    expect(restoreTasteAnswers([rejected('a'), rejected('b')]).answers).toEqual({ p4: { verdict: 'neither' } });
  });

  it('should separate the give-up reasons it offered from the ones the author typed', () => {
    const restored = restoreTasteAnswers([
      entry({ id: '1', kind: 'rejected', topic: 'taste.gave_up', payload: { optionId: 'r1', verdict: 'gave_up' }, statement: 'Protagonist never really loses' }),
      entry({ id: '2', kind: 'rejected', topic: 'taste.gave_up', payload: null, statement: 'Too many names in chapter one' }),
    ]);
    expect(restored.reasonIds).toEqual(['r1']);
    expect(restored.ownReasons).toEqual(['Too many names in chapter one']);
    expect(restored.answers).toEqual({});
  });

  it('should ignore an entry it cannot read as an answer', () => {
    const restored = restoreTasteAnswers([entry({ topic: 'taste.steer', payload: null }), entry({ payload: { optionId: 'p1', verdict: 'shrug' } })]);
    expect(restored).toEqual({ answers: {}, reasonIds: [], ownReasons: [] });
  });
});

describe('buildTasteSelection', () => {
  const parsed = parseTasteRound(ready());

  it('should send one verdict per answered pair', () => {
    const answers: TasteAnswers = { p1: { verdict: 'a' }, p2: { verdict: 'neither' } };
    expect(buildTasteSelection(parsed, answers, [], []).verdicts).toEqual([
      { optionId: 'p1', verdict: 'a' },
      { optionId: 'p2', verdict: 'neither' },
    ]);
  });

  it('should leave out a “depends” that says nothing and trim the one that does', () => {
    expect(buildTasteSelection(parsed, { p1: { verdict: 'depends', note: '   ' } }, [], []).verdicts).toEqual([]);
    expect(buildTasteSelection(parsed, { p2: { verdict: 'depends', note: '  on who is watching  ' } }, [], []).verdicts).toEqual([
      { optionId: 'p2', verdict: 'depends', note: 'on who is watching' },
    ]);
  });

  it('should drop answers and reasons the round never offered', () => {
    const selection = buildTasteSelection(parsed, { p9: { verdict: 'a' } }, ['r9'], []);
    expect(selection.verdicts).toEqual([]);
    expect(selection.reasonIds).toBeUndefined();
  });

  it('should trim, dedupe and cap the reasons the author typed', () => {
    const selection = buildTasteSelection(parsed, {}, ['r1'], ['  too many names  ', 'too many names', '   ']);
    expect(selection).toEqual({ verdicts: [], reasonIds: ['r1'], ownReasons: ['too many names'] });
  });
});

describe('hasTasteAnswer', () => {
  it('should be true for any answer and false for an empty lock', () => {
    expect(hasTasteAnswer({ verdicts: [] })).toBe(false);
    expect(hasTasteAnswer({ verdicts: [], ownReasons: ['romance took over'] })).toBe(true);
    expect(hasTasteAnswer({ verdicts: [{ optionId: 'p1', verdict: 'a' }] })).toBe(true);
  });
});
