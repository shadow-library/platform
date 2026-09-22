import { describe, expect, it } from 'bun:test';

import {
  assemblePremise,
  buildPremiseInput,
  buildPremiseSelection,
  canPreviewPremise,
  choosePremisePart,
  initialPremiseDraft,
  initialPremiseLines,
  isFocusedPremiseRound,
  nextPremiseLines,
  parsePremiseRound,
  passedOverAlternatives,
  premiseLinesFor,
  premiseRoundKey,
  previewPremiseText,
  resolvePremiseInput,
} from '../src/features/blueprint/premise-step';
import { type BlueprintRoundResponse } from '../src/lib/apis';

function round(overrides: Partial<BlueprintRoundResponse> = {}): BlueprintRoundResponse {
  return {
    id: 'r3',
    stepKey: 'premise',
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
  parts: [
    { id: 'p1', text: 'In the harbour city of Vell,', kind: 'setting', alternatives: [{ id: 'p1_a1', text: 'On the terraced island of Vell,' }] },
    { id: 'p2', text: 'a clerk who audits the dead', kind: 'protagonist', alternatives: [{ id: 'p2_a1', text: 'a diver who salvages contracts' }] },
  ],
  why: 'Built from the concept you kept.',
  writerLine: 'The mystery is personal from chapter 1.',
};

const ready = (): BlueprintRoundResponse => round({ options: OPTIONS });

describe('parsePremiseRound', () => {
  it('should read the parts, the why and the writer line', () => {
    const parsed = parsePremiseRound(ready());
    expect(parsed?.parts.map(part => part.id)).toEqual(['p1', 'p2']);
    expect(parsed?.writerLine).toBe('The mystery is personal from chapter 1.');
  });

  it('should read a round it cannot understand as no premise at all', () => {
    expect(parsePremiseRound(round())).toBeNull();
    expect(parsePremiseRound(round({ options: { parts: [{ id: 'p1', text: 'no kind' }] } }))).toBeNull();
  });
});

describe('premiseRoundKey', () => {
  it('should change when the sentence arrives', () => {
    expect(premiseRoundKey(round())).toBe('r3:pending');
    expect(premiseRoundKey(ready())).toBe('r3:ready');
  });
});

describe('initialPremiseDraft', () => {
  it('should start from the sentence the round wrote', () => {
    expect(initialPremiseDraft(parsePremiseRound(ready()))).toEqual([
      { id: 'p1', kind: 'setting', optionId: 'p1', text: 'In the harbour city of Vell,' },
      { id: 'p2', kind: 'protagonist', optionId: 'p2', text: 'a clerk who audits the dead' },
    ]);
    expect(initialPremiseDraft(null)).toEqual([]);
  });

  it('should not claim the author chose a part they wrote themselves', () => {
    const parsed = parsePremiseRound(round({ options: { ...OPTIONS, parts: [{ ...OPTIONS.parts[0]!, text: 'In the drowned quarter,' }, OPTIONS.parts[1]!] } }));
    const authored = [{ id: 'p1', kind: 'setting' as const, text: 'In the drowned quarter,' }];
    expect(initialPremiseDraft(parsed, authored)[0]).toEqual({ id: 'p1', kind: 'setting', text: 'In the drowned quarter,' });
    expect(initialPremiseDraft(parsed, [])[0]?.optionId).toBe('p1');
  });
});

describe('premiseLinesFor', () => {
  const parsed = parsePremiseRound(ready());
  const draft = initialPremiseDraft(parsed);

  it('should show the round’s lines while they still describe the sentence', () => {
    expect(premiseLinesFor(initialPremiseLines(parsed, draft), assemblePremise(draft))).toEqual({
      why: 'Built from the concept you kept.',
      writerLine: 'The mystery is personal from chapter 1.',
      stale: false,
    });
  });

  it('should clear the lines once the sentence they were written for has moved', () => {
    const swapped = choosePremisePart(draft, 'p2', { optionId: 'p2_a1', text: 'a diver who salvages contracts' });
    expect(premiseLinesFor(initialPremiseLines(parsed, draft), assemblePremise(swapped))).toEqual({ why: '', writerLine: '', stale: true });
  });
});

describe('nextPremiseLines', () => {
  const parsed = parsePremiseRound(ready());
  const draft = initialPremiseDraft(parsed);
  const swapped = choosePremisePart(draft, 'p2', { optionId: 'p2_a1', text: 'a diver who salvages contracts' });
  const mine = { why: 'mine', writerLine: 'Chapter one opens on the manifest.', forSentence: assemblePremise(swapped) };

  it('should keep the lines the author’s sentence still owns', () => {
    expect(nextPremiseLines(mine, parsed, swapped, false)).toBe(mine);
    expect(nextPremiseLines(mine, parsed, swapped, true)).toBe(mine);
  });

  // Swap a part, rework it, lock: the focused round still carries the lines written for the sentence before the swap.
  it('should not let a focused round put back a line written for a sentence the author changed', () => {
    const stale = initialPremiseLines(parsed, draft);
    const carried = nextPremiseLines(stale, parsed, swapped, true);
    expect(premiseLinesFor(carried, assemblePremise(swapped))).toEqual({ why: '', writerLine: '', stale: true });
    expect(buildPremiseSelection(swapped, premiseLinesFor(carried, assemblePremise(swapped)))).toBeNull();
  });

  it('should take a whole rewrite’s own lines', () => {
    const stale = initialPremiseLines(parsed, draft);
    expect(nextPremiseLines(stale, parsed, swapped, false)).toEqual({
      why: 'Built from the concept you kept.',
      writerLine: 'The mystery is personal from chapter 1.',
      forSentence: assemblePremise(swapped),
    });
  });
});

describe('isFocusedPremiseRound', () => {
  it('should read the part a round was asked to rework', () => {
    expect(isFocusedPremiseRound(round({ input: { part: 'p2', current: [] } }))).toBe(true);
    expect(isFocusedPremiseRound(round({ input: { current: [] } }))).toBe(false);
    expect(isFocusedPremiseRound(round())).toBe(false);
  });
});

describe('previewPremiseText', () => {
  it('should never ask for a preview the endpoint would refuse', () => {
    expect(previewPremiseText(`  ${'x'.repeat(900)}  `)).toHaveLength(600);
    expect(canPreviewPremise('too short')).toBe(false);
    expect(canPreviewPremise('A clerk who audits the dead finds his own childhood on a manifest.')).toBe(true);
  });
});

describe('choosePremisePart', () => {
  const draft = initialPremiseDraft(parsePremiseRound(ready()));

  it('should swap one part for an alternative and leave the rest alone', () => {
    const next = choosePremisePart(draft, 'p2', { optionId: 'p2_a1', text: 'a diver who salvages contracts' });
    expect(next[0]).toEqual(draft[0]!);
    expect(next[1]).toEqual({ id: 'p2', kind: 'protagonist', optionId: 'p2_a1', text: 'a diver who salvages contracts' });
  });

  it('should drop the option a part came from once the author writes their own', () => {
    const next = choosePremisePart(draft, 'p1', { text: '  In the drowned quarter of Vell,  ' });
    expect(next[0]).toEqual({ id: 'p1', kind: 'setting', optionId: undefined, text: 'In the drowned quarter of Vell,' });
  });
});

describe('assemblePremise', () => {
  it('should join the parts into one sentence and collapse the gaps', () => {
    const draft = choosePremisePart(initialPremiseDraft(parsePremiseRound(ready())), 'p2', { text: '  a clerk   who audits the dead.  ' });
    expect(assemblePremise(draft)).toBe('In the harbour city of Vell, a clerk who audits the dead.');
  });

  it('should skip a part the author emptied', () => {
    expect(
      assemblePremise([
        { id: 'p1', kind: 'setting', text: 'In Vell,' },
        { id: 'p2', kind: 'hook', text: '   ' },
      ]),
    ).toBe('In Vell,');
  });
});

describe('buildPremiseSelection', () => {
  const parsed = parsePremiseRound(ready());
  const LINES = { why: 'Built from the concept you kept.', writerLine: 'The mystery is personal from chapter 1.' };

  it('should send the parts, the sentence and the author’s why and writer line', () => {
    const selection = buildPremiseSelection(initialPremiseDraft(parsed), LINES);
    expect(selection).toEqual({
      parts: [
        { optionId: 'p1', text: 'In the harbour city of Vell,' },
        { optionId: 'p2', text: 'a clerk who audits the dead' },
      ],
      sentence: 'In the harbour city of Vell, a clerk who audits the dead',
      why: 'Built from the concept you kept.',
      writerLine: 'The mystery is personal from chapter 1.',
    });
  });

  it('should carry a part the author wrote with no option behind it', () => {
    const draft = choosePremisePart(initialPremiseDraft(parsed), 'p1', { text: 'In the drowned quarter,' });
    expect(buildPremiseSelection(draft, LINES)?.parts[0]).toEqual({ text: 'In the drowned quarter,' });
  });

  it('should refuse a sentence with nothing in it', () => {
    expect(buildPremiseSelection([], LINES)).toBeNull();
    expect(buildPremiseSelection([{ id: 'p1', kind: 'setting', text: '  ' }], LINES)).toBeNull();
  });

  it('should refuse a lock that says nothing about what the premise means for the writer', () => {
    expect(buildPremiseSelection(initialPremiseDraft(parsed), { why: 'a why', writerLine: '   ' })).toBeNull();
  });
});

describe('buildPremiseInput', () => {
  it('should send the sentence as it stands and the part being opened', () => {
    const draft = initialPremiseDraft(parsePremiseRound(ready()));
    expect(buildPremiseInput(draft, 'p2')).toEqual({
      part: 'p2',
      current: [
        { id: 'p1', text: 'In the harbour city of Vell,' },
        { id: 'p2', text: 'a clerk who audits the dead' },
      ],
    });
    expect(buildPremiseInput([], null)).toEqual({});
  });
});

describe('resolvePremiseInput', () => {
  it('should fall back to the sentence the round being steered was built from', () => {
    const stored = round({ options: OPTIONS, input: { current: [{ id: 'p1', text: 'In Vell,' }] } });
    expect(resolvePremiseInput([], 'p1', stored)).toEqual({ part: 'p1', current: [{ id: 'p1', text: 'In Vell,' }] });
    expect(resolvePremiseInput([], null, round())).toEqual({});
  });
});

describe('passedOverAlternatives', () => {
  it('should list every part and alternative the sentence did not take', () => {
    const parsed = parsePremiseRound(ready());
    const draft = choosePremisePart(initialPremiseDraft(parsed), 'p2', { optionId: 'p2_a1', text: 'a diver who salvages contracts' });
    expect(passedOverAlternatives(parsed, draft)).toEqual(['On the terraced island of Vell,', 'a clerk who audits the dead']);
    expect(passedOverAlternatives(null, draft)).toEqual([]);
  });
});
