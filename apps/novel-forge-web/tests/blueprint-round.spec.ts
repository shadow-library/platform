import { describe, expect, it } from 'bun:test';

import { buildRoundBody, EMPTY_STEER, roundThread, toFeedbackBody, toggleNudge } from '../src/features/blueprint/round';
import { isRoundLive } from '../src/lib/apis/blueprint.api';
import { buildStartInput, buildStartSelection, parseStartChips, parseStartInput, resolveStartInput, startChipsKey } from '../src/features/blueprint/start-step';
import { type BlueprintRoundResponse } from '../src/lib/apis';

function round(overrides: Partial<BlueprintRoundResponse> = {}): BlueprintRoundResponse {
  return {
    id: 'r1',
    stepKey: 'start',
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

describe('buildRoundBody', () => {
  it('should send nothing for an untouched steer box', () => {
    expect(buildRoundBody(EMPTY_STEER)).toEqual({});
  });

  it('should trim the steer and drop it when it is only whitespace', () => {
    expect(buildRoundBody({ ...EMPTY_STEER, text: '  more grit  ' })).toEqual({ steer: 'more grit' });
    expect(buildRoundBody({ ...EMPTY_STEER, text: '   ' })).toEqual({});
  });

  it('should dedupe and trim the nudges it was given', () => {
    expect(buildRoundBody({ ...EMPTY_STEER, nudges: [' Fewer chips ', 'Fewer chips', ''] })).toEqual({ nudges: ['Fewer chips'] });
  });

  it('should keep a steer as a direction only when there are words to keep', () => {
    expect(buildRoundBody({ text: 'keep the mentor hard on him', nudges: [], keepAsDirection: true })).toEqual({
      steer: 'keep the mentor hard on him',
      keepAsDirection: true,
    });
    expect(buildRoundBody({ text: '', nudges: ['Fewer chips'], keepAsDirection: true })).toEqual({ nudges: ['Fewer chips'] });
  });

  it('should carry the step’s own input when the screen has one', () => {
    expect(buildRoundBody(EMPTY_STEER, {}, { text: 'a kid who collects debts' })).toEqual({ input: { text: 'a kid who collects debts' } });
  });

  it('should carry option feedback and omit it when nothing was judged', () => {
    expect(buildRoundBody(EMPTY_STEER, { c1: { verdict: 'more' } })).toEqual({ feedback: [{ optionId: 'c1', verdict: 'more' }] });
    expect(buildRoundBody(EMPTY_STEER, {})).toEqual({});
  });
});

describe('toFeedbackBody', () => {
  it('should carry the reason a rejection was given', () => {
    expect(toFeedbackBody({ c1: { verdict: 'not', reason: '  too close to the last one  ' } })).toEqual([{ optionId: 'c1', verdict: 'not', reason: 'too close to the last one' }]);
  });

  it('should leave out a blank reason rather than send an empty string', () => {
    expect(toFeedbackBody({ c1: { verdict: 'not', reason: '   ' } })).toEqual([{ optionId: 'c1', verdict: 'not' }]);
  });

  it('should carry every judged option', () => {
    expect(toFeedbackBody({ c1: { verdict: 'more' }, c2: { verdict: 'mix' } })).toEqual([
      { optionId: 'c1', verdict: 'more' },
      { optionId: 'c2', verdict: 'mix' },
    ]);
  });
});

describe('toggleNudge', () => {
  it('should add a nudge that is not picked and remove one that is', () => {
    expect(toggleNudge([], 'Fewer chips')).toEqual(['Fewer chips']);
    expect(toggleNudge(['Fewer chips'], 'Fewer chips')).toEqual([]);
  });
});

describe('roundThread', () => {
  it('should show nothing before the step has been steered', () => {
    expect(roundThread(round())).toEqual([]);
    expect(roundThread(null)).toEqual([]);
  });

  it('should join the steer and its nudges into one line and answer with the coach', () => {
    expect(roundThread(round({ steer: 'more grit', nudges: ['Fewer chips'], coachMessage: 'Here is a tighter reading.' }))).toEqual([
      { who: 'you', text: 'more grit · Fewer chips' },
      { who: 'coach', text: 'Here is a tighter reading.' },
    ]);
  });
});

describe('isRoundLive', () => {
  it('should treat a queued or running round as live and anything settled as not', () => {
    expect(isRoundLive(round({ status: 'pending' }))).toBe(true);
    expect(isRoundLive(round({ status: 'running' }))).toBe(true);
    expect(isRoundLive(round({ status: 'failed' }))).toBe(false);
    expect(isRoundLive(null)).toBe(false);
  });
});

describe('parseStartChips', () => {
  it('should read the chips the round offered', () => {
    const options = { understood: [{ id: 'c1', label: 'Debt collector hero', kind: 'element' }] };

    expect(parseStartChips(round({ options }))).toEqual([{ optionId: 'c1', label: 'Debt collector hero', kind: 'element' }]);
  });

  it('should drop a malformed chip instead of crashing the screen', () => {
    const options = { understood: [{ id: 'c1', label: 'fine', kind: 'element' }, { id: 'c2', kind: 'sideways' }, 'nonsense'] };

    expect(parseStartChips(round({ options }))).toEqual([{ optionId: 'c1', label: 'fine', kind: 'element' }]);
  });

  it('should read no chips from a round that has not produced any', () => {
    expect(parseStartChips(round({ options: null }))).toEqual([]);
    expect(parseStartChips(round({ options: { understood: 'not a list' } }))).toEqual([]);
    expect(parseStartChips(null)).toEqual([]);
  });
});

describe('buildStartInput', () => {
  it('should send only what the author gave', () => {
    expect(buildStartInput('  a kid with a jar  ', null)).toEqual({ text: 'a kid with a jar' });
    expect(buildStartInput('', 'nothing')).toEqual({ startingType: 'nothing' });
    expect(buildStartInput('   ', null)).toEqual({});
  });
});

describe('buildStartSelection', () => {
  it('should keep the chip ids the round offered and leave them off the author’s own', () => {
    const selection = buildStartSelection([
      { optionId: 'c1', label: 'Costly magic', kind: 'element' },
      { label: 'Found family', kind: 'want' },
    ]);

    expect(selection.chips).toEqual([
      { optionId: 'c1', label: 'Costly magic', kind: 'element' },
      { label: 'Found family', kind: 'want' },
    ]);
  });

  it('should drop a chip the author emptied rather than send a blank label', () => {
    expect(buildStartSelection([{ optionId: 'c1', label: '   ', kind: 'element' }]).chips).toEqual([]);
  });

  it('should never send more chips than the step accepts', () => {
    const chips = Array.from({ length: 15 }, (_, index) => ({ label: `chip ${index}`, kind: 'element' as const }));

    expect(buildStartSelection(chips).chips).toHaveLength(12);
  });
});

describe('startChipsKey', () => {
  it('should change when the round it is showing changes', () => {
    expect(startChipsKey(round({ id: 'r1' }))).not.toBe(startChipsKey(round({ id: 'r2' })));
  });

  it('should change when the round already on screen produces its options', () => {
    const pending = round({ id: 'r1', status: 'running', options: null });
    const ready = round({ id: 'r1', status: 'ready', options: { understood: [] } });

    expect(startChipsKey(pending)).not.toBe(startChipsKey(ready));
  });

  it('should stay the same across a refetch of one ready round', () => {
    const options = { understood: [{ id: 'c1', label: 'a', kind: 'element' }] };

    expect(startChipsKey(round({ options }))).toBe(startChipsKey(round({ options })));
  });
});

describe('parseStartInput', () => {
  it('should read back what the author wrote for this round', () => {
    expect(parseStartInput(round({ input: { text: 'a kid with a jar', startingType: 'scene' } }))).toEqual({ text: 'a kid with a jar', startingType: 'scene' });
  });

  it('should ignore an input it cannot recognise', () => {
    expect(parseStartInput(round({ input: { text: 7, startingType: 'sideways' } }))).toEqual({});
    expect(parseStartInput(round({ input: null }))).toEqual({});
    expect(parseStartInput(null)).toEqual({});
  });
});

describe('resolveStartInput', () => {
  it('should prefer what the author has typed now', () => {
    expect(resolveStartInput('a new angle', null, round({ input: { text: 'the old one' } }))).toEqual({ text: 'a new angle' });
  });

  it('should fall back to the round being steered when the box has been cleared', () => {
    expect(resolveStartInput('', null, round({ input: { text: 'the old one' } }))).toEqual({ text: 'the old one' });
  });

  it('should send nothing when neither has anything', () => {
    expect(resolveStartInput('  ', null, round())).toEqual({});
  });
});
