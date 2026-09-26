import { describe, expect, it } from 'bun:test';

import { type DiffHunk, diffProse } from '@modules/generation/prose-diff';

const side = (hunks: readonly DiffHunk[], dropped: DiffHunk['op']): string =>
  hunks
    .filter(hunk => hunk.op !== dropped)
    .map(hunk => hunk.text)
    .join('');

describe('diffProse', () => {
  it('should show an edited word as a word, not a rewritten paragraph', () => {
    const diff = diffProse('The keeper counts the ships.\n\nThe tide turns.', 'The keeper counts the boats.\n\nThe tide turns.');

    expect(diff.hunks).toEqual([
      { op: 'equal', text: 'The keeper counts the ' },
      { op: 'delete', text: 'ships.' },
      { op: 'insert', text: 'boats.' },
      { op: 'equal', text: '\n\nThe tide turns.' },
    ]);
    expect(diff).toMatchObject({ wordsAdded: 1, wordsRemoved: 1 });
  });

  it('should rebuild both texts from the hunks', () => {
    const before = 'One.\n\nTwo halves of a line.\n\nThree.\n';
    const after = 'Zero.\n\nOne.\n\nTwo parts of a line.\n';

    const { hunks } = diffProse(before, after);

    expect(side(hunks, 'insert')).toBe(before);
    expect(side(hunks, 'delete')).toBe(after);
  });

  it('should answer identical texts with a single unchanged hunk', () => {
    expect(diffProse('Same text.', 'Same text.')).toEqual({ hunks: [{ op: 'equal', text: 'Same text.' }], wordsAdded: 0, wordsRemoved: 0 });
  });

  it('should fall back to a removal and an insertion when the change is too large to align', () => {
    const before = Array.from({ length: 2100 }, (_, n) => `a${n}`).join(' ');
    const after = Array.from({ length: 2100 }, (_, n) => `b${n}`).join(' ');

    const { hunks } = diffProse(before, after);

    expect(hunks.map(hunk => hunk.op)).toEqual(['delete', 'insert']);
    expect(side(hunks, 'insert')).toBe(before);
  });
});
