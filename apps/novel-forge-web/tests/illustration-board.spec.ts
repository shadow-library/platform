import { describe, expect, it } from 'bun:test';

import {
  type BoardIllustration,
  candidateSlots,
  countBySubject,
  depictsChapterLabel,
  depictsChapterOptions,
  depictsChapterVisibilityNote,
  filterIllustrations,
  formatElapsed,
  futureChapterError,
  identityMeta,
  illustrationCaption,
  illustrationChipLabel,
  newestIllustrationFor,
  parseFutureChapter,
  parseRunTarget,
  parseSubjectType,
  pendingPair,
  pickHint,
  runStageOf,
  runTarget,
  shownCandidates,
  splitBoardRuns,
  startBodyOf,
  subjectLabel,
  thumbnailOf,
  unclaimedStarts,
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

describe('subjectLabel with entity names', () => {
  it("should show the entity's name when it is known, and its key when it is not", () => {
    const entity = { subjectType: 'entity', subjectKey: 'wren', origin: 'generated' } as const;
    expect(subjectLabel(entity, new Map([['wren', 'Wren Ashby']]))).toBe('Wren Ashby');
    expect(subjectLabel(entity, new Map())).toBe('wren');
  });
});

describe('parseRunTarget', () => {
  it('should read the subject of a started illustration', () => {
    expect(parseRunTarget('entity:wren')).toMatchObject({ subjectType: 'entity', subjectKey: 'wren' });
    expect(parseRunTarget('chapter:3')).toMatchObject({ subjectType: 'chapter', subjectKey: '3' });
    expect(parseRunTarget('cover:cover')).toMatchObject({ subjectType: 'cover', subjectKey: null });
  });

  it('should ignore a refine run, which belongs to an illustration that already exists', () => {
    expect(parseRunTarget('refine:12')).toBeUndefined();
  });

  it('should round-trip what runTarget builds', () => {
    expect(parseRunTarget(runTarget('entity', 'key:with:colons'))).toMatchObject({ subjectKey: 'key:with:colons' });
    expect(runTarget('cover')).toBe('cover:cover');
  });
});

describe('splitBoardRuns', () => {
  const NOW = Date.parse('2026-11-03T12:00:00Z');
  const run = (id: string, target: string, status: string, startedAt = '2026-11-03T11:59:00Z') => ({ id, target, status, startedAt });
  const NONE = new Set<string>();

  it('should separate running from failed and skip completed, cancelled and refine runs', () => {
    const runs = [
      run('a', 'entity:wren', 'running'),
      run('b', 'cover:cover', 'failed'),
      run('c', 'chapter:1', 'completed'),
      run('d', 'chapter:2', 'cancelled'),
      run('e', 'refine:9', 'running'),
    ];
    const { running, failed } = splitBoardRuns(runs, NONE, NONE, NOW);
    expect(running.map(item => item.id)).toEqual(['a']);
    expect(failed.map(item => item.id)).toEqual(['b']);
  });

  it('should drop a failure once something newer was tried for that subject', () => {
    const runs = [run('new', 'entity:wren', 'completed'), run('old', 'entity:wren', 'failed')];
    expect(splitBoardRuns(runs, NONE, NONE, NOW).failed).toEqual([]);
  });

  it('should drop a failure while a retry of that subject is on its way', () => {
    expect(splitBoardRuns([run('old', 'entity:wren', 'failed')], new Set(['entity:wren']), NONE, NOW).failed).toEqual([]);
  });

  it('should leave out a failure the author dismissed', () => {
    expect(splitBoardRuns([run('old', 'entity:wren', 'failed')], NONE, new Set(['old']), NOW).failed).toEqual([]);
  });

  it('should read a run nobody settled as failed once it is long past any real render', () => {
    const { running, failed } = splitBoardRuns([run('stuck', 'entity:wren', 'running', '2026-11-03T11:30:00Z')], NONE, NONE, NOW);
    expect(running).toEqual([]);
    expect(failed.map(item => item.id)).toEqual(['stuck']);
  });
});

describe('unclaimedStarts', () => {
  it('should keep only starts no running run has claimed', () => {
    const running = [{ id: 'a', target: 'entity:wren', status: 'running', startedAt: '2026-11-03T11:59:00Z' }];
    expect(unclaimedStarts([{ target: 'entity:wren' }, { target: 'cover:cover' }], running)).toEqual([{ target: 'cover:cover' }]);
  });
});

describe('runStageOf', () => {
  it('should stay composing until the compose call has succeeded', () => {
    expect(runStageOf(undefined)).toBe('composing');
    expect(runStageOf([{ node: null, status: 'ok' }])).toBe('composing');
    expect(runStageOf([{ node: 'compose', status: 'transport_error' }])).toBe('composing');
    expect(runStageOf([{ node: 'compose', status: 'ok' }])).toBe('rendering');
  });
});

describe('formatElapsed', () => {
  it('should format minutes and padded seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(85)).toBe('1:25');
  });
});

describe('startBodyOf', () => {
  it('should rebuild the body an entity render was started with', () => {
    const body = startBodyOf({
      subjectType: 'entity',
      subjectKey: 'wren',
      instructions: ['cold light'],
      references: [{ source: 'portrait', sourceId: 'wren', role: 'likeness' }],
      autoReferences: false,
      depictsChapter: 2,
    });
    expect(body).toEqual({
      subjectType: 'entity',
      subjectKey: 'wren',
      instruction: 'cold light',
      references: [{ source: 'portrait', sourceId: 'wren', role: 'likeness' }],
      autoReferences: false,
      depictsChapter: 2,
    });
  });

  it('should send a cover none of the fields a cover refuses', () => {
    expect(startBodyOf({ subjectType: 'cover', subjectKey: null, instructions: [], references: [], autoReferences: true, depictsChapter: null })).toEqual({
      subjectType: 'cover',
      subjectKey: undefined,
      instruction: undefined,
      references: undefined,
      autoReferences: undefined,
      depictsChapter: undefined,
    });
  });
});

describe('newestIllustrationFor', () => {
  const run = { target: 'entity:wren', startedAt: '2026-11-03T12:00:00Z' };

  it('should find what the run created', () => {
    const made = { subjectType: 'entity', subjectKey: 'wren', createdAt: '2026-11-03T12:01:30Z' } as const;
    expect(newestIllustrationFor([made], run)).toBe(made);
  });

  it('should not mistake an older illustration of the same subject for it', () => {
    expect(newestIllustrationFor([{ subjectType: 'entity', subjectKey: 'wren', createdAt: '2026-11-03T11:00:00Z' }], run)).toBeUndefined();
  });
});

describe('illustrationChipLabel', () => {
  it('should tell an open choice from a made one', () => {
    expect(illustrationChipLabel({ status: 'active', origin: 'generated', selectedRef: null })).toBe('pick one');
    expect(illustrationChipLabel({ status: 'active', origin: 'generated', selectedRef: 'r1' })).toBe('picked');
  });

  it('should keep the stored status everywhere else', () => {
    expect(illustrationChipLabel({ status: 'saved', origin: 'generated', selectedRef: 'r1' })).toBe('saved');
    expect(illustrationChipLabel({ status: 'discarded', origin: 'generated' })).toBe('discarded');
    expect(illustrationChipLabel({ status: 'active', origin: 'uploaded', selectedRef: 'r1' })).toBe('active');
  });
});

describe('pendingPair', () => {
  it('should offer the newest two while the choice is open', () => {
    expect(pendingPair({ status: 'active', origin: 'generated', candidates: ['a', 'b', 'c', 'd'] })).toEqual(['c', 'd']);
  });

  it('should not offer a pair for a lone candidate or a made choice', () => {
    expect(pendingPair({ status: 'active', origin: 'generated', candidates: ['a'] })).toBeUndefined();
    expect(pendingPair({ status: 'active', origin: 'generated', selectedRef: 'r', candidates: ['a', 'b'] })).toBeUndefined();
  });
});

describe('shownCandidates', () => {
  const candidates = [{ ref: 'a' }, { ref: 'b' }];

  it('should show every candidate while the illustration is open', () => {
    expect(shownCandidates({ status: 'active', candidates })).toEqual(candidates);
  });

  it('should show only the kept candidate once saved, since saving deleted the rest', () => {
    expect(shownCandidates({ status: 'saved', selectedRef: 'b', candidates })).toEqual([{ ref: 'b' }]);
  });
});

describe('pickHint', () => {
  it('should warn that saving deletes the others only once something is picked', () => {
    expect(pickHint({ status: 'active' })).toContain('Click the image');
    expect(pickHint({ status: 'active', selectedRef: 'a' })).toContain('deletes the others');
    expect(pickHint({ status: 'saved', selectedRef: 'a' })).toBeUndefined();
  });
});

describe('candidateSlots without a held partner', () => {
  it('should leave a kept image alone, since a saved illustration renders no more', () => {
    expect(candidateSlots(['a'], false, false)).toEqual([{ kind: 'candidate', candidate: 'a' }]);
  });
});
