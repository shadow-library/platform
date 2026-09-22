import { describe, expect, it } from 'bun:test';

import {
  buildHeartSelection,
  chooseHeartOption,
  editHeartAnswer,
  EMPTY_HEART_ANSWER,
  heartAnswerFor,
  type HeartAnswers,
  heartRoundKey,
  mergeHeartAnswers,
  parseHeartRound,
  restoreHeartAnswers,
} from '../src/features/blueprint/heart-step';
import { type BlueprintRoundResponse, type LedgerEntryResponse } from '../src/lib/apis';

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: '1',
    projectId: '7',
    kind: 'decision',
    phase: 'heart',
    topic: 'theme',
    statement: 'If memories can be sold, what makes you you?',
    why: 'From the cost rule.',
    rejectedAlternatives: [],
    writerLine: 'Every scene weighs what a memory was worth.',
    decidedBy: 'author',
    stepKey: 'heart',
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
    stepKey: 'heart',
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
  themes: [{ id: 't1', text: 'What makes you you?', why: 'From the cost rule.', writerLine: 'Weigh every memory.' }],
  endings: [{ id: 'e1', text: 'Will he take his past back?', why: 'From the hook.', caution: 'It gets solved rather than answered.', writerLine: 'Show both selves.' }],
};

describe('parseHeartRound', () => {
  it('should read the themes and the endings with their cautions', () => {
    const parsed = parseHeartRound(round({ options: OPTIONS }));
    expect(parsed.themes[0]).toEqual({ id: 't1', text: 'What makes you you?', why: 'From the cost rule.', writerLine: 'Weigh every memory.' });
    expect(parsed.endings[0]?.caution).toBe('It gets solved rather than answered.');
  });

  it('should read a round of a shape this build does not know as no options', () => {
    expect(parseHeartRound(round({ options: { themes: 'nope' } }))).toEqual({ themes: [], endings: [] });
    expect(parseHeartRound(null)).toEqual({ themes: [], endings: [] });
  });

  it('should drop an option with no text', () => {
    expect(parseHeartRound(round({ options: { themes: [{ id: 't1' }, ...OPTIONS.themes] } })).themes).toHaveLength(1);
  });
});

describe('heartRoundKey', () => {
  it('should change when a round’s options arrive, not only when its id does', () => {
    expect(heartRoundKey(round())).toBe('r1:pending');
    expect(heartRoundKey(round({ options: OPTIONS }))).toBe('r1:ready');
    expect(heartRoundKey(null)).toBe('none');
  });
});

describe('editHeartAnswer', () => {
  it('should keep the option while the text is the one it offered', () => {
    const answer = chooseHeartOption(OPTIONS.themes[0]!);
    expect(editHeartAnswer(answer, { why: 'Mine.' }).optionId).toBe('t1');
    expect(editHeartAnswer(answer, { text: '  What makes you you?  ' }).optionId).toBe('t1');
  });

  it('should make it the author’s own once they change the words', () => {
    const answer = chooseHeartOption(OPTIONS.themes[0]!);
    expect(editHeartAnswer(answer, { text: 'What does a life cost?' }).optionId).toBeUndefined();
  });

  it('should strand the coach’s lines on a rewrite rather than carrying them into the chapter packs', () => {
    const answer = chooseHeartOption(OPTIONS.themes[0]!);
    expect(heartAnswerFor(answer)).toMatchObject({ why: 'From the cost rule.', writerLine: 'Weigh every memory.', stale: false });

    const rewritten = editHeartAnswer(answer, { text: 'What does a life cost?' });
    expect(heartAnswerFor(rewritten)).toMatchObject({ why: '', writerLine: '', whyStale: true, writerLineStale: true });
  });

  it('should re-anchor only the line the author writes, leaving the writer line to be said again', () => {
    const rewritten = editHeartAnswer(chooseHeartOption(OPTIONS.themes[0]!), { text: 'What does a life cost?' });
    const said = editHeartAnswer(rewritten, { why: 'Because a life has a price.' });
    expect(heartAnswerFor(said)).toMatchObject({ why: 'Because a life has a price.', whyStale: false, writerLine: '', writerLineStale: true });
    expect(buildHeartSelection({ theme: said, ending: EMPTY_HEART_ANSWER })).toBeNull();
  });

  it('should re-anchor only the writer line when that is the one the author writes', () => {
    const rewritten = editHeartAnswer(chooseHeartOption(OPTIONS.themes[0]!), { text: 'What does a life cost?' });
    const said = editHeartAnswer(rewritten, { writerLine: 'Price every scene.' });
    expect(heartAnswerFor(said)).toMatchObject({ why: '', whyStale: true, writerLine: 'Price every scene.', writerLineStale: false });
  });

  it('should send only the lines written for the wording being locked', () => {
    const rewritten = editHeartAnswer(chooseHeartOption(OPTIONS.themes[0]!), { text: 'What does a life cost?' });
    const theme = editHeartAnswer(rewritten, { writerLine: 'Price every scene.' });
    const ending = chooseHeartOption(OPTIONS.endings[0]!);
    expect(buildHeartSelection({ theme, ending })?.theme).toEqual({ text: 'What does a life cost?', writerLine: 'Price every scene.' });
  });

  it('should keep the lines when the author only re-spaces the text', () => {
    const answer = chooseHeartOption(OPTIONS.themes[0]!);
    expect(heartAnswerFor(editHeartAnswer(answer, { text: '  What makes you you?  ' })).stale).toBe(false);
  });
});

describe('buildHeartSelection', () => {
  const full: HeartAnswers = {
    theme: {
      optionId: 't1',
      text: ' What makes you you? ',
      why: ' From the cost rule. ',
      writerLine: ' Weigh every memory. ',
      whyFor: ' What makes you you? ',
      writerLineFor: ' What makes you you? ',
    },
    ending: { text: 'Will he take his past back?', why: '', writerLine: 'Show both selves.', whyFor: 'Will he take his past back?', writerLineFor: 'Will he take his past back?' },
  };

  it('should send both halves, trimmed, with an empty why left out', () => {
    expect(buildHeartSelection(full)).toEqual({
      theme: { optionId: 't1', text: 'What makes you you?', why: 'From the cost rule.', writerLine: 'Weigh every memory.' },
      ending: { text: 'Will he take his past back?', writerLine: 'Show both selves.' },
    });
  });

  it('should refuse to build a lock that carries only one half', () => {
    expect(buildHeartSelection({ ...full, ending: EMPTY_HEART_ANSWER })).toBeNull();
    expect(buildHeartSelection({ ...full, theme: { ...full.theme, writerLine: '   ' } })).toBeNull();
  });

  it('should refuse a lock whose writer line was written for wording the author has left behind', () => {
    expect(buildHeartSelection({ ...full, theme: editHeartAnswer(full.theme, { text: 'What does a life cost?' }) })).toBeNull();
  });
});

describe('restoreHeartAnswers', () => {
  it('should read back both decisions as the author’s own words', () => {
    const restored = restoreHeartAnswers([entry(), entry({ id: '2', topic: 'ending', statement: 'Will he take his past back?', why: null, writerLine: null })]);
    expect(restored.theme).toMatchObject({
      text: 'If memories can be sold, what makes you you?',
      why: 'From the cost rule.',
      writerLine: 'Every scene weighs what a memory was worth.',
    });
    expect(restored.ending).toMatchObject({ text: 'Will he take his past back?', why: '', writerLine: '' });
    expect(restored.theme?.optionId).toBeUndefined();
    expect(restored.theme && heartAnswerFor(restored.theme).stale).toBe(false);
  });

  it('should ignore a steering entry on the same topics', () => {
    expect(restoreHeartAnswers([entry({ kind: 'direction' })]).theme).toBeUndefined();
  });
});

describe('mergeHeartAnswers', () => {
  it('should let whatever the author touched win over the notebook', () => {
    const restored = restoreHeartAnswers([entry()]);
    const touched = { theme: { text: 'Mine.', why: '', writerLine: 'Mine.', whyFor: 'Mine.', writerLineFor: 'Mine.' } };
    expect(mergeHeartAnswers(restored, touched).theme.text).toBe('Mine.');
    expect(mergeHeartAnswers(restored, {}).theme.text).toBe('If memories can be sold, what makes you you?');
    expect(mergeHeartAnswers({}, {}).ending).toEqual(EMPTY_HEART_ANSWER);
  });
});
