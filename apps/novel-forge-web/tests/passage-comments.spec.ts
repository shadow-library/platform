import { describe, expect, it } from 'bun:test';

import {
  addChip,
  chipLimitReason,
  chipSessionKey,
  chipsOfSent,
  commentGate,
  isUnanswered,
  locateChip,
  markStale,
  MAX_PASSAGE_COMMENTS,
  nextReveal,
  parseStoredChips,
  type PassageChip,
  passageChip,
  passageRef,
  REWRITE_COMMENT,
  rewriteChip,
  selectionRef,
  shownContexts,
  staleChipIds,
  withQuickComment,
} from '../src/lib/passage-comments';

const BODY = '# Chapter 3\nShe ran.\n* * *\nThe tide turns late tonight.\n\nGulls cry.';
const QUOTE = 'The tide turns late tonight.';
const START = BODY.indexOf(QUOTE);
const DRAFT = { id: '7', chapter: 3, revision: 4, saveSeq: 9, body: BODY };

function chip(overrides: Partial<PassageChip['context']> = {}, id = `7:${START}`): PassageChip {
  return {
    id,
    context: {
      kind: 'passage',
      chapter: 3,
      draftId: '7',
      revision: 4,
      saveSeq: 9,
      start: START,
      end: START + QUOTE.length,
      passageHash: 'h',
      quote: QUOTE,
      comment: '',
      ...overrides,
    },
    firstParagraph: 3,
    lastParagraph: 3,
  };
}

type GateDraft = Parameters<typeof commentGate>[0];
const OPEN: GateDraft = { status: 'draft', reviewStatus: 'needs_review', body: BODY, staleReason: null, isolated: false };

describe('passageChip', () => {
  it('should carry the draft it was selected in, a trimmed comment and the shared splitter’s paragraphs', () => {
    const built = passageChip(DRAFT, { start: START, end: START + QUOTE.length, text: QUOTE }, '  Tighten  ', 'abc');
    expect(built).toEqual({
      id: `7:${START}:${START + QUOTE.length}`,
      context: {
        kind: 'passage',
        chapter: 3,
        draftId: '7',
        revision: 4,
        saveSeq: 9,
        start: START,
        end: START + QUOTE.length,
        passageHash: 'abc',
        quote: QUOTE,
        comment: 'Tighten',
      },
      firstParagraph: 3,
      lastParagraph: 3,
    });
  });

  it('should label a passage by chapter and paragraph, a range when it spans several', () => {
    expect(passageRef(3, 4, 4)).toBe('Ch 3 · ¶4');
    expect(passageRef(3, 4, 6)).toBe('Ch 3 · ¶4–6');
    const end = BODY.indexOf('Gulls') + 5;
    expect(selectionRef(DRAFT, { start: BODY.indexOf('She'), end, text: BODY.slice(BODY.indexOf('She'), end) })).toBe('Ch 3 · ¶2–4');
  });

  it('should show the chips as the sent message shows them, and turn a sent message’s comments back into chips for a retry', () => {
    const [shown] = shownContexts([chip({ saveSeq: undefined })]);
    expect(shown).toMatchObject({ saveSeq: 0, firstParagraph: 3, lastParagraph: 3, quote: QUOTE });
    expect(chipsOfSent(shownContexts([chip()]))).toEqual([{ ...chip(), id: `7:${START}:${START + QUOTE.length}` }]);
    expect(chipsOfSent(null)).toEqual([]);
  });
});

describe('addChip', () => {
  it('should replace the same passage commented on again rather than add it twice', () => {
    const first = addChip([], chip({ comment: 'one' }));
    const again = first.kind === 'added' ? addChip(first.chips, chip({ comment: 'two' })) : first;
    expect(again).toEqual({ kind: 'added', chips: [chip({ comment: 'two' })] });
  });

  it('should refuse an eleventh passage, with a reason, but still take a replacement', () => {
    const full = Array.from({ length: MAX_PASSAGE_COMMENTS }, (_, index) => chip({}, `c${index}`));
    expect(addChip(full, chip({}, 'new'))).toEqual({ kind: 'full' });
    expect(addChip(full, chip({ comment: 'x' }, 'c3')).kind).toBe('added');
    expect(chipLimitReason(MAX_PASSAGE_COMMENTS)).toContain('10');
    expect(chipLimitReason(MAX_PASSAGE_COMMENTS - 1)).toBeUndefined();
  });

  it('should mark only the named chips stale', () => {
    expect(markStale([chip({}, 'a'), chip({}, 'b')], new Set(['b'])).map(entry => entry.stale)).toEqual([undefined, true]);
  });
});

describe('rewriteChip', () => {
  it('should ask for a rewrite on a new passage and keep the author’s own comment on one already commented on', () => {
    expect(rewriteChip(chip({ comment: REWRITE_COMMENT }), undefined).context.comment).toBe(REWRITE_COMMENT);
    expect(rewriteChip(chip({ comment: REWRITE_COMMENT }), chip({ comment: 'Make it the old wrist injury.' })).context.comment).toBe('Make it the old wrist injury.');
    expect(rewriteChip(chip({ comment: REWRITE_COMMENT }), chip({ comment: '  ' })).context.comment).toBe(REWRITE_COMMENT);
  });
});

describe('nextReveal', () => {
  it('should reveal again on a second click after an answered reveal was cleared', () => {
    const first = nextReveal('a', 0);
    expect(isUnanswered(first, undefined)).toBe(true);
    const answered = first.nonce;
    expect(isUnanswered(first, answered)).toBe(false);
    expect(isUnanswered(undefined, answered)).toBe(false);
    expect(isUnanswered(nextReveal('a', 1), answered)).toBe(true);
  });
});

describe('chipSessionKey', () => {
  it('should keep a chat not started yet apart per novel, and a chat by its own id', () => {
    expect(chipSessionKey('novel-a', undefined)).not.toBe(chipSessionKey('novel-b', undefined));
    expect(chipSessionKey('novel-a', 's1')).toBe('s1');
    expect(chipSessionKey('novel-a', undefined)).not.toBe(chipSessionKey('novel-a', 's1'));
  });
});

describe('locateChip', () => {
  it('should find a passage where it was selected, or its one occurrence in the same draft', () => {
    expect(locateChip(BODY, '7', chip().context)).toEqual({ start: START, end: START + QUOTE.length });
    expect(locateChip(`New line.\n\n${BODY}`, '7', chip().context)).toEqual({ start: START + 11, end: START + 11 + QUOTE.length });
  });

  it('should not find it in another draft, when its words are gone, or when they occur twice', () => {
    expect(locateChip(BODY, '8', chip().context)).toBeUndefined();
    expect(locateChip(BODY.replace('late', 'early'), '7', chip().context)).toBeUndefined();
    expect(locateChip(`${QUOTE}\n\n${QUOTE}`, '7', chip().context)).toBeUndefined();
  });
});

describe('staleChipIds', () => {
  it('should name the chips their drafts no longer hold, and every chip when none can be told', () => {
    const drafts = new Map([[3, { id: '7', body: BODY.replace('late', 'early') }]]);
    const other = chip({ chapter: 5 }, 'other');
    expect(staleChipIds([chip(), other], new Map([...drafts, [5, undefined]]))).toEqual(new Set([`7:${START}`, 'other']));
    expect(staleChipIds([chip()], new Map([[3, { id: '7', body: BODY }]]))).toEqual(new Set([`7:${START}`]));
  });
});

describe('commentGate', () => {
  it('should offer every action on a draft the author is working on', () => {
    expect(commentGate(OPEN, false)).toEqual({});
  });

  it('should withhold commenting on an isolated chapter and one being written, with a reason', () => {
    expect(commentGate({ ...OPEN, isolated: true }, false).comment).toContain('isolated');
    expect(commentGate(OPEN, true)).toMatchObject({ comment: expect.stringContaining('being written'), edit: expect.any(String) });
  });

  it('should let a final chapter be asked about but not rewritten or edited', () => {
    const gate = commentGate({ ...OPEN, status: 'final' }, false);
    expect(gate.comment).toBeUndefined();
    expect(gate.rewrite).toContain('Final');
    expect(gate.edit).toContain('Final');
  });
});

describe('withQuickComment', () => {
  it('should fill an empty comment and append to one already written', () => {
    expect(withQuickComment('  ', 'Tighten')).toBe('Tighten');
    expect(withQuickComment('Too slow', 'Cut')).toBe('Too slow. Cut');
    expect(withQuickComment('Too slow.', 'Cut')).toBe('Too slow. Cut');
  });
});

describe('parseStoredChips', () => {
  it('should read stored chips back and drop anything malformed or past the limit', () => {
    const stored = JSON.stringify([chip(), { id: 'x' }, chip({ quote: 3 as unknown as string }, 'bad')]);
    expect(parseStoredChips(stored)).toEqual([chip()]);
    expect(parseStoredChips('not json')).toEqual([]);
    expect(parseStoredChips(null)).toEqual([]);
    expect(parseStoredChips(JSON.stringify(Array.from({ length: 12 }, (_, index) => chip({}, `c${index}`))))).toHaveLength(MAX_PASSAGE_COMMENTS);
  });
});
