import { describe, expect, it } from 'bun:test';

import { type StudioQuestionResponse } from '../src/lib/apis/api-types.gen';
import { answeredCount, composeAnswers, nextUnanswered, questionLabel, recoverAnswers } from '../src/lib/studio-answers';

const question = (id: string, wording: string, options: string[] = ['First option', 'Second option']): StudioQuestionResponse => ({
  id,
  wording,
  coaching: 'Coaching line.',
  options,
  youDecide: 'The studio pick.',
});

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
