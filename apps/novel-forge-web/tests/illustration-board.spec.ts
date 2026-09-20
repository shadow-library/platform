import { describe, expect, it } from 'bun:test';

import {
  type BoardIllustration,
  candidateSlots,
  countBySubject,
  filterIllustrations,
  identityMeta,
  illustrationCaption,
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
