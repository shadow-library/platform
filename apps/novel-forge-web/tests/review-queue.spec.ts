import { describe, expect, it } from 'bun:test';

import {
  backLabel,
  chapterBadge,
  chapterTitle,
  isEditableElement,
  nextAfterApproval,
  parseChapterParam,
  queueIds,
  queueMeta,
  queueReason,
  reviewCounts,
  reviewHotkey,
  type ReviewHotkeyEvent,
  type ReviewQueueDraft,
  wordCount,
} from '../src/lib/review-queue';

function draft(overrides: Partial<ReviewQueueDraft> = {}): ReviewQueueDraft {
  return { chapter: 4, title: 'The Ledger', reviewStatus: 'needs_review', body: 'one two three', updatedAt: new Date().toISOString(), ...overrides };
}

function keyEvent(overrides: Partial<ReviewHotkeyEvent> = {}): ReviewHotkeyEvent {
  return { key: 'a', ctrlKey: false, metaKey: false, altKey: false, editableTarget: false, ...overrides };
}

describe('parseChapterParam', () => {
  it('should accept a positive integer as a number or a string', () => {
    expect(parseChapterParam(12)).toBe(12);
    expect(parseChapterParam('12')).toBe(12);
  });

  it('should reject anything that is not a chapter number', () => {
    for (const value of [undefined, null, '', 'twelve', 0, -3, 1.5, {}]) expect(parseChapterParam(value)).toBeUndefined();
  });
});

describe('queueIds', () => {
  it('should key the pager by chapter number in queue order', () => {
    expect(queueIds([draft({ chapter: 2 }), draft({ chapter: 11 })])).toEqual(['2', '11']);
  });
});

describe('chapterTitle', () => {
  it('should fall back to a placeholder for a missing or blank title', () => {
    expect(chapterTitle({ title: '  ' })).toBe('Untitled chapter');
    expect(chapterTitle({ title: null })).toBe('Untitled chapter');
    expect(chapterTitle({ title: 'The Ledger' })).toBe('The Ledger');
  });
});

describe('chapterBadge', () => {
  it('should pad a single-digit chapter and leave longer ones alone', () => {
    expect(chapterBadge(4)).toBe('CH.04');
    expect(chapterBadge(112)).toBe('CH.112');
  });
});

describe('queueReason', () => {
  it('should name what put the chapter in the queue', () => {
    expect(queueReason({ reviewStatus: 'contradiction' })).toBe('The judge flagged a contradiction');
    expect(queueReason({ reviewStatus: 'needs_review' })).toBe('Finished drafting — waiting on your read');
  });
});

describe('wordCount', () => {
  it('should count whitespace-separated words and treat empty prose as zero', () => {
    expect(wordCount(' one  two\nthree ')).toBe(3);
    expect(wordCount('')).toBe(0);
    expect(wordCount(null)).toBe(0);
  });
});

describe('queueMeta', () => {
  it('should pair the word count with how long the draft has waited', () => {
    expect(queueMeta({ body: 'one two', updatedAt: new Date().toISOString() })).toBe('2 words · queued just now');
  });

  it('should drop the wait when the timestamp is unreadable', () => {
    expect(queueMeta({ body: 'one two', updatedAt: 'not-a-date' })).toBe('2 words');
  });
});

describe('backLabel', () => {
  it('should name the queue size once it is known', () => {
    expect(backLabel(4)).toBe('All 4 in the queue');
    expect(backLabel(undefined)).toBe('Review queue');
  });
});

describe('reviewCounts', () => {
  it('should fold final into approved and report drafting and flagged separately', () => {
    const counts = reviewCounts([
      { reviewStatus: 'approved' },
      { reviewStatus: 'final' },
      { reviewStatus: 'generating' },
      { reviewStatus: 'contradiction' },
      { reviewStatus: 'needs_review' },
    ]);
    expect(counts).toEqual([
      { label: 'approved', value: 2 },
      { label: 'drafting', value: 1 },
      { label: 'flagged', value: 1 },
    ]);
  });

  it('should report zeroes for an empty project rather than an empty strip', () => {
    expect(reviewCounts([])).toEqual([
      { label: 'approved', value: 0 },
      { label: 'drafting', value: 0 },
      { label: 'flagged', value: 0 },
    ]);
  });
});

describe('nextAfterApproval', () => {
  it('should advance to the next chapter still in the queue', () => {
    expect(nextAfterApproval(['2', '5', '9'], '5')).toBe('9');
  });

  it('should return nothing for the last chapter so the author lands on the directory', () => {
    expect(nextAfterApproval(['2', '5', '9'], '9')).toBeUndefined();
    expect(nextAfterApproval(['5'], '5')).toBeUndefined();
  });

  it('should return nothing while the queue is unresolved or the chapter is not in it', () => {
    expect(nextAfterApproval(undefined, '5')).toBeUndefined();
    expect(nextAfterApproval(['2', '9'], '5')).toBeUndefined();
  });
});

describe('isEditableElement', () => {
  it('should treat form controls and contenteditable hosts as editable', () => {
    expect(isEditableElement('TEXTAREA', false)).toBe(true);
    expect(isEditableElement('input', false)).toBe(true);
    expect(isEditableElement('DIV', true)).toBe(true);
  });

  it('should treat ordinary elements as not editable', () => {
    expect(isEditableElement('DIV', false)).toBe(false);
    expect(isEditableElement('BUTTON', false)).toBe(false);
  });
});

describe('reviewHotkey', () => {
  it('should map the advertised keys to their dispositions, in either case', () => {
    expect(reviewHotkey(keyEvent({ key: 'a' }))).toBe('approve');
    expect(reviewHotkey(keyEvent({ key: 'R' }))).toBe('revise');
    expect(reviewHotkey(keyEvent({ key: 'x' }))).toBe('reject');
  });

  it('should ignore an unmapped key', () => {
    expect(reviewHotkey(keyEvent({ key: 'k' }))).toBeNull();
  });

  it('should ignore a key pressed with a modifier, so browser and palette shortcuts still win', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) expect(reviewHotkey(keyEvent({ [modifier]: true }))).toBeNull();
  });

  it('should ignore a key typed into a field', () => {
    expect(reviewHotkey(keyEvent({ editableTarget: true }))).toBeNull();
  });
});
