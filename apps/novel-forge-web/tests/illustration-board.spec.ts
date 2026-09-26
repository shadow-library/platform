import { describe, expect, it } from 'bun:test';

import {
  type BoardIllustration,
  candidateSlots,
  countBySubject,
  depictsChapterLabel,
  depictsChapterOptions,
  depictsChapterVisibilityNote,
  filterIllustrations,
  futureChapterError,
  identityMeta,
  illustrationCaption,
  parseFutureChapter,
  parseSubjectType,
  subjectLabel,
  thumbnailOf,
} from '../src/lib/illustration-board';

function illustration(overrides: Partial<BoardIllustration> & Pick<BoardIllustration, 'id'>): BoardIllustration {
  return { subjectType: 'entity', origin: 'generated', revision: 1, candidates: [], ...overrides };
}

describe('parseSubjectType', () => {
  it('should accept a known subject type', () => {
    expect(parseSubjectType('chapter')).toBe('chapter');
  });

  it('should reject anything else', () => {
    expect(parseSubjectType('all')).toBeUndefined();
    expect(parseSubjectType(undefined)).toBeUndefined();
    expect(parseSubjectType(3)).toBeUndefined();
  });
});

describe('subjectLabel', () => {
  it('should name an uploaded cover by its origin rather than its subject', () => {
    expect(subjectLabel({ subjectType: 'cover', origin: 'uploaded' })).toBe('Uploaded cover');
  });

  it('should name a composed cover, a chapter scene and an entity', () => {
    expect(subjectLabel({ subjectType: 'cover', origin: 'generated' })).toBe('Project cover');
    expect(subjectLabel({ subjectType: 'chapter', subjectKey: '12', origin: 'generated' })).toBe('Chapter 12');
    expect(subjectLabel({ subjectType: 'entity', subjectKey: 'detective_amara', origin: 'generated' })).toBe('detective_amara');
  });

  it('should fall back to the type when an entity illustration has lost its key', () => {
    expect(subjectLabel({ subjectType: 'entity', subjectKey: null, origin: 'generated' })).toBe('Entity');
  });
});

describe('thumbnailOf', () => {
  it('should prefer the selected image', () => {
    expect(thumbnailOf({ selectedUrl: 'selected.png', candidates: [{ imageUrl: 'a.png' }] })).toBe('selected.png');
  });

  it('should fall back to the newest candidate', () => {
    expect(thumbnailOf({ candidates: [{ imageUrl: 'a.png' }, { imageUrl: 'b.png' }] })).toBe('b.png');
  });

  it('should return nothing while a session has rendered no image at all', () => {
    expect(thumbnailOf({ selectedUrl: null, candidates: [] })).toBeUndefined();
  });
});

describe('illustrationCaption and identityMeta', () => {
  it('should caption a tile with its kind and revision', () => {
    expect(illustrationCaption({ subjectType: 'chapter', revision: 3 })).toBe('Chapter · rev 3');
  });

  it('should spell the revision out on the detail identity line', () => {
    expect(identityMeta({ subjectType: 'cover', revision: 1 }, '18h ago')).toBe('Cover · revision 1 · 18h ago');
  });
});

describe('filterIllustrations', () => {
  const items = [
    illustration({ id: 'a', subjectType: 'entity', subjectKey: 'amara' }),
    illustration({ id: 'b', subjectType: 'chapter', subjectKey: '4' }),
    illustration({ id: 'c', subjectType: 'cover' }),
    illustration({ id: 'd', subjectType: 'entity', subjectKey: 'boone' }),
  ];

  it('should keep everything under the all filter', () => {
    expect(filterIllustrations(items, 'all').map(item => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('should narrow to one subject type', () => {
    expect(filterIllustrations(items, 'entity').map(item => item.id)).toEqual(['a', 'd']);
  });

  it('should narrow to a single subject key', () => {
    expect(filterIllustrations(items, 'all', 'amara').map(item => item.id)).toEqual(['a']);
  });

  it('should return nothing when the type and the key disagree', () => {
    expect(filterIllustrations(items, 'chapter', 'amara')).toEqual([]);
  });
});

describe('countBySubject', () => {
  it('should count every subject type, including the ones with nothing in them', () => {
    const counts = countBySubject([illustration({ id: 'a' }), illustration({ id: 'b', subjectType: 'cover' }), illustration({ id: 'c' })]);
    expect(counts).toEqual({ entity: 2, chapter: 0, cover: 1 });
  });
});

describe('candidateSlots', () => {
  it('should draw an empty partner beside a lone candidate', () => {
    expect(candidateSlots(['one'], false)).toEqual([{ kind: 'candidate', candidate: 'one' }, { kind: 'empty' }]);
  });

  it('should draw a pair of empty slots when nothing has rendered yet', () => {
    expect(candidateSlots([], false)).toEqual([{ kind: 'empty' }, { kind: 'empty' }]);
  });

  it('should draw both candidates of a full pair and nothing more', () => {
    expect(candidateSlots(['one', 'two'], false)).toHaveLength(2);
  });

  it('should fill the unrendered slots with rendering placeholders while a round is in flight', () => {
    expect(candidateSlots([], true)).toEqual([{ kind: 'rendering' }, { kind: 'rendering' }]);
    expect(candidateSlots(['one'], true)).toEqual([{ kind: 'candidate', candidate: 'one' }, { kind: 'rendering' }]);
  });

  it('should append one rendering slot when a full pair is being replaced', () => {
    expect(candidateSlots(['one', 'two'], true)).toEqual([{ kind: 'candidate', candidate: 'one' }, { kind: 'candidate', candidate: 'two' }, { kind: 'rendering' }]);
  });

  it('should keep more than a pair when a round returned extra candidates', () => {
    expect(candidateSlots(['one', 'two', 'three'], false)).toHaveLength(3);
  });
});

describe('depictsChapterOptions', () => {
  it('should list every chapter from the frontier down to before-the-story, newest first', () => {
    expect(depictsChapterOptions(3)).toEqual([
      { value: 3, label: 'Chapter 3 · latest final' },
      { value: 2, label: 'Chapter 2' },
      { value: 1, label: 'Chapter 1' },
      { value: 0, label: 'Before the story' },
    ]);
  });

  it('should offer only "before the story" when nothing has been finalized yet', () => {
    expect(depictsChapterOptions(0)).toEqual([{ value: 0, label: 'Before the story' }]);
  });

  it('should never include a chapter past the frontier', () => {
    const options = depictsChapterOptions(5);
    expect(options.every(option => option.value <= 5)).toBe(true);
    expect(options).toHaveLength(6);
  });
});

describe('depictsChapterLabel', () => {
  it('should mark the frontier chapter as the latest final one', () => {
    expect(depictsChapterLabel(4, 4)).toBe('Chapter 4 · latest final');
  });

  it('should name an earlier chapter plainly and chapter 0 as before the story', () => {
    expect(depictsChapterLabel(2, 4)).toBe('Chapter 2');
    expect(depictsChapterLabel(0, 4)).toBe('Before the story');
  });
});

describe('depictsChapterVisibilityNote', () => {
  it('should name the chapter readers see it from', () => {
    expect(depictsChapterVisibilityNote(3, 4)).toBe('Readers see this from chapter 3 on.');
  });

  it('should call out chapter 0 as the very start', () => {
    expect(depictsChapterVisibilityNote(0, 4)).toBe('Readers see this from the very start.');
  });

  it('should explain a future chapter stays hidden until it publishes', () => {
    expect(depictsChapterVisibilityNote(7, 4)).toBe('Hidden from readers until chapter 7 is finalized and published.');
  });

  it('should keep a legacy undated image visible to everyone', () => {
    expect(depictsChapterVisibilityNote(null, 4)).toBe('Shown to all readers (dated before this change).');
  });
});

describe('parseFutureChapter', () => {
  it('should accept a whole number past the frontier', () => {
    expect(parseFutureChapter('7', 4)).toBe(7);
    expect(parseFutureChapter(' 5 ', 4)).toBe(5);
  });

  it('should reject a number at or below the frontier', () => {
    expect(parseFutureChapter('4', 4)).toBeUndefined();
    expect(parseFutureChapter('1', 4)).toBeUndefined();
  });

  it('should reject a fractional chapter', () => {
    expect(parseFutureChapter('5.5', 4)).toBeUndefined();
  });

  it('should reject an empty or non-numeric draft', () => {
    expect(parseFutureChapter('', 4)).toBeUndefined();
    expect(parseFutureChapter('   ', 4)).toBeUndefined();
    expect(parseFutureChapter('abc', 4)).toBeUndefined();
  });
});

describe('futureChapterError', () => {
  it('should say nothing for a valid future chapter', () => {
    expect(futureChapterError('7', 4)).toBeUndefined();
  });

  it('should name the frontier for a chapter at or below it', () => {
    expect(futureChapterError('4', 4)).toBe('Enter a whole chapter number after 4');
  });

  it('should give the same message for a fractional or empty draft', () => {
    expect(futureChapterError('5.5', 4)).toBe('Enter a whole chapter number after 4');
    expect(futureChapterError('', 4)).toBe('Enter a whole chapter number after 4');
  });
});
