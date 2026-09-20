import { describe, expect, it } from 'bun:test';

import { type StudioQuestionResponse } from '../src/lib/apis/api-types.gen';
import {
  answeredCount,
  composeAnswers,
  decideAnswer,
  holdsOption,
  nextUnanswered,
  questionLabel,
  recoverAnswers,
  shouldAdvanceAfter,
  toggleOption,
} from '../src/lib/studio-answers';

const question = (id: string, wording: string, options: string[] = ['First option', 'Second option'], select: 'one' | 'many' = 'one'): StudioQuestionResponse => ({
  id,
  wording,
  coaching: 'Coaching line.',
  options,
  youDecide: 'The studio pick.',
  select,
});

const many = (id: string, wording: string, options: string[]): StudioQuestionResponse => question(id, wording, options, 'many');

const tone = many('tone', 'Which tones are in play — what should the prose feel like?', ['Wry', 'Tender', 'Bleak']);

const shelf = question('shelf', 'Which shelf does this sit on — what genre would a reader browse for?', ['System-fantasy romance', 'Villainess fantasy']);
const place = question('place', 'Where does this actually happen, and when — which room will the reader spend most time in?', ['The noble academy', 'The royal court']);
const length = question('length', 'How long is this?', ['Open-ended serial', 'Finite novel']);

describe('questionLabel', () => {
  it('should cut the wording at the first spaced em dash and end it with a question mark', () => {
    expect(questionLabel('Where does this happen, and when — which room — really?')).toBe('Where does this happen, and when?');
  });

  it('should use a wording without a spaced em dash whole', () => {
    expect(questionLabel('How long is this?')).toBe('How long is this?');
    expect(questionLabel('Name the stakes')).toBe('Name the stakes?');
  });
});

describe('composeAnswers', () => {
  it('should follow the round order rather than the order answers were picked', () => {
    const message = composeAnswers([shelf, place, length], { length: { kind: 'option', index: 1 }, shelf: { kind: 'option', index: 0 } });

    expect(message).toBe('Which shelf does this sit on?\nSystem-fantasy romance\n\nHow long is this?\nFinite novel');
  });

  it('should omit unanswered questions', () => {
    const message = composeAnswers([shelf, place, length], { place: { kind: 'decide' }, length: { kind: 'own', text: '   ' } });

    expect(message).toBe('Where does this actually happen, and when?\nThe studio pick.');
  });

  it('should trim typed answers and the note', () => {
    const message = composeAnswers([shelf, place], { place: { kind: 'own', text: '  A harbour town  \n' } }, '  Keep it grounded.  ');

    expect(message).toBe('Where does this actually happen, and when?\nA harbour town\n\nKeep it grounded.');
  });

  it('should add nothing for an empty note', () => {
    expect(composeAnswers([shelf], { shelf: { kind: 'option', index: 1 } }, '   ')).toBe('Which shelf does this sit on?\nVillainess fantasy');
  });

  it('should send the note alone when no question is answered', () => {
    expect(composeAnswers([shelf, place], {}, 'Just a thought')).toBe('Just a thought');
  });
});

describe('answeredCount', () => {
  it('should count only questions whose answer has text', () => {
    expect(answeredCount([shelf, place, length], { shelf: { kind: 'decide' }, place: { kind: 'own', text: '' }, length: undefined })).toBe(1);
  });
});

describe('nextUnanswered', () => {
  it('should find the first unanswered question after the current one', () => {
    expect(nextUnanswered([shelf, place, length], { shelf: { kind: 'option', index: 0 } }, 0)).toBe(1);
    expect(nextUnanswered([shelf, place, length], { place: { kind: 'decide' } }, 0)).toBe(2);
  });

  it('should not wrap round to an earlier gap', () => {
    expect(nextUnanswered([shelf, place, length], { length: { kind: 'decide' } }, 1)).toBeUndefined();
  });
});

describe('recoverAnswers', () => {
  it('should read back every answer composeAnswers wrote', () => {
    const answers = { shelf: { kind: 'option', index: 1 }, place: { kind: 'decide' }, length: { kind: 'own', text: 'Three volumes.\n\nThen an epilogue.' } } as const;

    expect(recoverAnswers([shelf, place, length], composeAnswers([shelf, place, length], answers))).toEqual(answers);
  });

  it('should leave out a question the reply skipped', () => {
    const reply = composeAnswers([shelf, place, length], { place: { kind: 'option', index: 0 } });

    expect(recoverAnswers([shelf, place, length], reply)).toEqual({ place: { kind: 'option', index: 0 } });
  });

  it('should still match a picked option when a note follows the last answer', () => {
    const reply = composeAnswers([shelf, length], { length: { kind: 'option', index: 0 } }, 'Keep the tone light.');

    expect(recoverAnswers([shelf, length], reply)).toEqual({ length: { kind: 'option', index: 0 } });
  });

  it('should yield nothing for a reply written in the author’s own words', () => {
    expect(recoverAnswers([shelf, place, length], 'Villainess fantasy, set at court, and open-ended.')).toBeUndefined();
  });

  it('should hand repeated labels to their questions in round order', () => {
    const first = question('first', 'Which one — the early pick?', ['Alpha', 'Beta']);
    const second = question('second', 'Which one — the late pick?', ['Gamma', 'Delta']);

    expect(recoverAnswers([first, second], 'Which one?\nBeta\n\nWhich one?\nGamma')).toEqual({
      first: { kind: 'option', index: 1 },
      second: { kind: 'option', index: 0 },
    });
  });
});

describe('toggleOption', () => {
  it('should replace the pick on a single-select question and clear it when picked again', () => {
    expect(toggleOption(shelf, undefined, 1)).toEqual({ kind: 'option', index: 1 });
    expect(toggleOption(shelf, { kind: 'option', index: 0 }, 1)).toEqual({ kind: 'option', index: 1 });
    expect(toggleOption(shelf, { kind: 'option', index: 1 }, 1)).toBeUndefined();
  });

  it('should accumulate picks on a multi-select question in option order', () => {
    expect(toggleOption(tone, undefined, 2)).toEqual({ kind: 'options', indexes: [2] });
    expect(toggleOption(tone, { kind: 'options', indexes: [2] }, 0)).toEqual({ kind: 'options', indexes: [0, 2] });
  });

  it('should drop a pick already held and yield no answer once the last one goes', () => {
    expect(toggleOption(tone, { kind: 'options', indexes: [0, 2] }, 0)).toEqual({ kind: 'options', indexes: [2] });
    expect(toggleOption(tone, { kind: 'options', indexes: [2] }, 2)).toBeUndefined();
  });

  it('should clear "You decide" when an option is picked on a multi-select question', () => {
    expect(toggleOption(tone, { kind: 'decide' }, 1)).toEqual({ kind: 'options', indexes: [1] });
  });
});

describe('holdsOption', () => {
  it('should report a pick held by either selection variant', () => {
    expect(holdsOption({ kind: 'option', index: 1 }, 1)).toBe(true);
    expect(holdsOption({ kind: 'options', indexes: [0, 2] }, 2)).toBe(true);
    expect(holdsOption({ kind: 'options', indexes: [0, 2] }, 1)).toBe(false);
    expect(holdsOption({ kind: 'decide' }, 0)).toBe(false);
    expect(holdsOption(undefined, 0)).toBe(false);
  });
});

describe('composeAnswers on a multi-select question', () => {
  it('should write one picked option per line', () => {
    expect(composeAnswers([tone], { tone: { kind: 'options', indexes: [0, 2] } })).toBe('Which tones are in play?\nWry\nBleak');
  });

  it('should write a single pick as that option alone', () => {
    expect(composeAnswers([tone], { tone: { kind: 'options', indexes: [1] } })).toBe('Which tones are in play?\nTender');
  });

  it('should count a multi answer once and skip one whose picks no longer resolve', () => {
    expect(answeredCount([tone], { tone: { kind: 'options', indexes: [0, 2] } })).toBe(1);
    expect(answeredCount([tone], { tone: { kind: 'options', indexes: [7] } })).toBe(0);
    expect(nextUnanswered([tone, length], { tone: { kind: 'options', indexes: [7] } }, -1)).toBe(0);
  });
});

describe('recoverAnswers on a multi-select question', () => {
  it('should read several picks back out of the reply composeAnswers wrote', () => {
    const answers = { tone: { kind: 'options', indexes: [0, 2] }, length: { kind: 'option', index: 1 } } as const;

    expect(recoverAnswers([tone, length], composeAnswers([tone, length], answers))).toEqual(answers);
  });

  it('should round-trip a single pick as the multi variant rather than collapsing it', () => {
    const reply = composeAnswers([tone], { tone: { kind: 'options', indexes: [1] } });

    expect(recoverAnswers([tone], reply)).toEqual({ tone: { kind: 'options', indexes: [1] } });
  });

  it('should read a historical single-select reply back as a multi answer of one pick', () => {
    expect(recoverAnswers([tone], 'Which tones are in play?\nBleak')).toEqual({ tone: { kind: 'options', indexes: [2] } });
  });

  it('should still read "You decide" back as the exclusive answer it is', () => {
    expect(recoverAnswers([tone], composeAnswers([tone], { tone: { kind: 'decide' } }))).toEqual({ tone: { kind: 'decide' } });
  });

  it('should keep a picked option when a note follows the block', () => {
    const reply = composeAnswers([tone], { tone: { kind: 'options', indexes: [0, 1] } }, 'Nothing too arch.');

    expect(recoverAnswers([tone], reply)).toEqual({ tone: { kind: 'options', indexes: [0, 1] } });
  });

  it('should fall back to the author’s own words when a line matches no option', () => {
    expect(recoverAnswers([tone], 'Which tones are in play?\nWry\nSomething else entirely')).toEqual({
      tone: { kind: 'own', text: 'Wry\nSomething else entirely' },
    });
  });

  it('should fall back to the author’s own words for an option that holds a newline of its own', () => {
    const split = many('split', 'Which ones?', ['A pick\nover two lines', 'Plain pick']);
    const reply = composeAnswers([split], { split: { kind: 'options', indexes: [0, 1] } });

    expect(recoverAnswers([split], reply)).toEqual({ split: { kind: 'own', text: 'A pick\nover two lines\nPlain pick' } });
  });

  it('should recover a single newline-bearing pick whole, since the block matches it exactly', () => {
    const split = many('split', 'Which ones?', ['A pick\nover two lines', 'Plain pick']);

    expect(recoverAnswers([split], composeAnswers([split], { split: { kind: 'options', indexes: [0] } }))).toEqual({ split: { kind: 'options', indexes: [0] } });
  });

  it('should trim whitespace around an option on both sides of the round trip', () => {
    const padded = many('padded', 'Which ones?', ['  Wry  ', 'Bleak']);

    expect(recoverAnswers([padded], composeAnswers([padded], { padded: { kind: 'options', indexes: [0, 1] } }))).toEqual({ padded: { kind: 'options', indexes: [0, 1] } });
  });

  it('should hand each line of a duplicated option list to a distinct index', () => {
    const twins = many('twins', 'Which ones?', ['Same', 'Same', 'Other']);

    expect(recoverAnswers([twins], composeAnswers([twins], { twins: { kind: 'options', indexes: [0, 1] } }))).toEqual({ twins: { kind: 'options', indexes: [0, 1] } });
    expect(recoverAnswers([twins], composeAnswers([twins], { twins: { kind: 'options', indexes: [1] } }))).toEqual({ twins: { kind: 'options', indexes: [0] } });
  });

  it('should read free text whose every line is an option as those picks', () => {
    expect(recoverAnswers([tone], 'Which tones are in play?\nBleak\nWry')).toEqual({ tone: { kind: 'options', indexes: [2, 0] } });
  });

  it('should leave a single-select question matching a lead line on the single variant', () => {
    expect(recoverAnswers([tone, length], 'Which tones are in play?\nWry\n\nHow long is this?\nFinite novel')).toEqual({
      tone: { kind: 'options', indexes: [0] },
      length: { kind: 'option', index: 1 },
    });
  });
});

describe('shouldAdvanceAfter', () => {
  it('should not advance for an option pick on a multi-select question', () => {
    expect(shouldAdvanceAfter(tone, { kind: 'options', indexes: [0] })).toBe(false);
  });

  it('should advance for an option pick on a single-select question', () => {
    expect(shouldAdvanceAfter(shelf, { kind: 'option', index: 0 })).toBe(true);
  });

  it('should advance for "You decide" on both a single- and multi-select question', () => {
    expect(shouldAdvanceAfter(shelf, { kind: 'decide' })).toBe(true);
    expect(shouldAdvanceAfter(tone, { kind: 'decide' })).toBe(true);
  });
});

describe('decideAnswer', () => {
  it('should replace existing picks with a "You decide" answer', () => {
    expect(decideAnswer({ kind: 'options', indexes: [0, 1] })).toEqual({ kind: 'decide' });
  });

  it('should clear "You decide" when it is already held', () => {
    expect(decideAnswer({ kind: 'decide' })).toBeUndefined();
  });

  it('should set "You decide" when nothing is held', () => {
    expect(decideAnswer(undefined)).toEqual({ kind: 'decide' });
  });
});

describe('toggleOption and shouldAdvanceAfter together', () => {
  it('should leave no picks and not skip a beat when the last multi-select pick is removed', () => {
    const next = toggleOption(tone, { kind: 'options', indexes: [1] }, 1);
    expect(next).toBeUndefined();
  });

  it('should clear "You decide" and yield an advancing-ineligible options answer when an option is picked over it', () => {
    const next = toggleOption(tone, { kind: 'decide' }, 1);
    expect(next).toEqual({ kind: 'options', indexes: [1] });
    expect(next && shouldAdvanceAfter(tone, next)).toBe(false);
  });
});
