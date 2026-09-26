import { describe, expect, it } from 'bun:test';

import { anchorContext, isWithinBody, locatePassage, MAX_PASSAGE_CHARS, passageHash, replacePassage } from '@modules/generation/passage-anchor';

const BODY = 'The keeper counts the ships at the harbour wall. The tide turns late tonight. The ferry waits by the empty pier for dawn.';
const PASSAGE = 'The tide turns late tonight.';
const START = BODY.indexOf(PASSAGE);
const END = START + PASSAGE.length;
const ANCHOR = { start: START, end: END, passageHash: passageHash(PASSAGE), passage: PASSAGE, ...anchorContext(BODY, START, END) };

describe('locatePassage', () => {
  it('should find the passage fresh where it was anchored', () => {
    expect(locatePassage(BODY, ANCHOR)).toEqual({ freshness: 'fresh', start: START, end: END });
  });

  it('should stay fresh when text away from the passage changed', () => {
    expect(locatePassage(`${BODY} Gulls cry over the water.`, ANCHOR).freshness).toBe('fresh');
  });

  it('should re-locate a cleanly moved passage whose hash and surrounding context still match', () => {
    const moved = `Night falls over the town. ${BODY}`;

    const location = locatePassage(moved, ANCHOR);

    expect(location).toEqual({ freshness: 'relocated', start: START + 27, end: END + 27 });
    expect(moved.slice(location.start ?? 0, location.end ?? 0)).toBe(PASSAGE);
  });

  it('should mark a passage stale when the text around it was edited, even where its own words and offsets still hold', () => {
    const edited = BODY.replace('harbour wall', 'harbour gate');

    expect(edited.slice(START, END)).toBe(PASSAGE);
    expect(locatePassage(edited, ANCHOR)).toEqual({ freshness: 'stale', start: null, end: null });
  });

  it('should mark a moved passage stale when its text and context now occur more than once', () => {
    expect(locatePassage(`${BODY} ${BODY}`.replace(/^The keeper/, 'A keeper'), ANCHOR).freshness).toBe('stale');
  });

  it('should mark a changed passage stale', () => {
    expect(locatePassage(BODY.replace('turns late', 'turns early'), ANCHOR).freshness).toBe('stale');
  });

  it('should mark a moved passage stale when the stored text does not match its hash', () => {
    expect(locatePassage(`Night falls over the town. ${BODY}`, { ...ANCHOR, passageHash: passageHash('something else') }).freshness).toBe('stale');
  });
});

describe('isWithinBody', () => {
  it.each([
    ['an empty selection', 5, 5, false],
    ['a reversed selection', 6, 5, false],
    ['a selection past the end', 0, BODY.length + 1, false],
    ['a negative start', -1, 4, false],
    ['a fractional offset', 0.5, 4, false],
    ['a selection inside the body', 0, 4, true],
  ])('should judge %s', (_, start, end, within) => {
    expect(isWithinBody(BODY, start, end)).toBe(within);
  });

  it('should refuse a selection longer than the passage limit', () => {
    const long = 'a'.repeat(MAX_PASSAGE_CHARS + 1);

    expect(isWithinBody(long, 0, long.length)).toBe(false);
  });
});

describe('replacePassage', () => {
  it('should replace only the located passage', () => {
    expect(replacePassage(BODY, ANCHOR, 'The tide will not turn.')).toBe(
      'The keeper counts the ships at the harbour wall. The tide will not turn. The ferry waits by the empty pier for dawn.',
    );
  });
});
