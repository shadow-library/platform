import { describe, expect, it } from 'bun:test';

import { nextChapterNumber } from '@modules/ai/context/novel-chat-context';
import { ChapterRowsService } from '@modules/generation/chapter-rows.service';
import { insertHandWrittenDraft } from '@modules/generation/draft-save';
import { hashReviewedBody } from '@modules/review/review-findings';
import { DraftConflictError } from '@server/classes';
import { nextWritableChapter } from '@server/common';
import { schema } from '@server/database';

import { FakeAuthoringClaims } from '../jobs/authoring-claim-fixtures';
import { type DraftSeed, draftTables } from './draft-tables';
import { makeGenerationService } from './generation-fixtures';

type Row = Record<string, unknown>;

const PROSE = { title: 'Low Water', body: 'The ferry waits for a tide that never turns.', summary: 'The ferry is stranded.' };
const EDITED = { ...PROSE, body: 'The ferry waits, and the tide turns at last.' };

/** Chapters 1–3 are drafted; chapter 3 sits at revision 2 from generation, and chapter 4 is the next to write. */
function novel(overrides: { chapter3?: Row; later?: readonly Row[]; revisions?: readonly Row[] } & Omit<DraftSeed, 'drafts' | 'revisions'> = {}) {
  const { chapter3, later = [], revisions, ...seed } = overrides;
  const tables = draftTables({
    ...seed,
    drafts: [
      { id: 1n, chapter: 1, body: 'One.', revision: 1 },
      { id: 2n, chapter: 2, body: 'Two.', revision: 1 },
      { id: 3n, chapter: 3, body: 'The keeper counts the ships.', revision: 2, generator: 'standard', ...chapter3 },
      ...later,
    ],
    revisions: revisions ?? [{ draftId: 3n, revision: 2, source: 'generated', body: 'The keeper counts the ships.' }],
  });
  return { tables, service: makeGenerationService(tables.db, { chapterImages: { onChapterDeleted: async () => undefined } }) };
}

const base = (baseRevision: number, baseSaveSeq: number, baseDraftId = 3n) => ({ baseDraftId, baseRevision, baseSaveSeq });

async function conflictOf(save: Promise<unknown>): Promise<DraftConflictError> {
  const error = await save.then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
  expect(error).toBeInstanceOf(DraftConflictError);
  return error as DraftConflictError;
}

describe('GenerationService — base revision on hand saves', () => {
  it('should save against a matching base as a new revision', async () => {
    const { tables, service } = novel();

    const draft = await service.updateDraft(7n, 3, { ...PROSE, ...base(2, 0) });

    expect(draft).toMatchObject({ revision: 3, saveSeq: 1, body: PROSE.body, reviewStatus: 'needs_review' });
    expect(tables.revisionsOf(3).map(row => [row['revision'], row['source']])).toEqual([
      [2, 'generated'],
      [3, 'hand_edited'],
    ]);
  });

  it.each([
    ['a hand edit behind the revision', (service: ReturnType<typeof novel>['service']) => service.updateDraft(7n, 3, { ...PROSE, ...base(1, 5) })],
    ['an import behind the revision', (service: ReturnType<typeof novel>['service']) => service.importDraft(7n, 3, { prose: PROSE.body, ...base(1, 5) })],
    ['a save behind the save sequence', (service: ReturnType<typeof novel>['service']) => service.updateDraft(7n, 3, { ...PROSE, ...base(2, 4) })],
    ['a save against another draft of the chapter', (service: ReturnType<typeof novel>['service']) => service.updateDraft(7n, 3, { ...PROSE, ...base(2, 5, 99n) })],
  ])('should refuse %s with the current draft, changing nothing', async (_, save) => {
    const { tables, service } = novel({ chapter3: { saveSeq: 5 }, later: [{ id: 5n, chapter: 4, body: 'Four.', revision: 1 }] });

    const conflict = await conflictOf(save(service));

    expect(conflict.code).toBe('DRF_013');
    expect(conflict.toResponse()).toMatchObject({ code: 'DRF_013', current: { id: 3n, revision: 2, saveSeq: 5, body: 'The keeper counts the ships.', title: null } });
    expect(tables.writes).toEqual([]);
    expect(tables.draft(3)).toMatchObject({ revision: 2, saveSeq: 5 });
    expect(tables.draft(4)?.['staleReason']).toBeNull();
  });

  it('should keep the prose it answers with out of anything a logger would walk', async () => {
    const { service } = novel({ chapter3: { saveSeq: 5 } });

    const conflict = await conflictOf(service.updateDraft(7n, 3, { ...PROSE, ...base(2, 4) }));

    expect(Object.keys(conflict)).not.toContain('current');
    expect(JSON.stringify({ ...conflict })).not.toContain('The keeper counts the ships.');
    expect(conflict.toResponse().current.body).toBe('The keeper counts the ships.');
  });

  it.each([
    ['a revision alone', { baseRevision: 2 }],
    ['a revision and save sequence without the draft', { baseRevision: 2, baseSaveSeq: 0 }],
    ['a draft alone', { baseDraftId: 3n }],
  ])('should refuse a base of %s as incomplete', async (_, partial) => {
    const { tables, service } = novel();

    await expect(service.updateDraft(7n, 3, { ...PROSE, ...partial })).rejects.toMatchObject({ code: 'DRF_020' });
    expect(tables.writes).toEqual([]);
  });

  it('should refuse a base for a chapter whose draft is gone', async () => {
    const { tables, service } = novel();

    await expect(service.updateDraft(7n, 4, { ...PROSE, ...base(0, 0, 4n) })).rejects.toMatchObject({ code: 'DRF_013' });
    expect(tables.writes).toEqual([]);
  });

  it('should refuse a stale tab saving over a chapter that was deleted and started again', async () => {
    const { tables, service } = novel({ chapter3: { revision: 0 } });
    await service.deleteDraft(7n, 3);
    const restarted = await service.updateDraft(7n, 3, PROSE);

    const conflict = await conflictOf(service.updateDraft(7n, 3, { ...EDITED, ...base(0, 0, 3n) }));

    expect(restarted).toMatchObject({ revision: 0, saveSeq: 0 });
    expect(conflict.toResponse().current).toMatchObject({ id: restarted.id, body: PROSE.body });
    expect(tables.draft(3)?.['body']).toBe(PROSE.body);
  });

  it.each([
    ['a pending', 'pending'],
    ['a running', 'in_progress'],
  ])('should refuse a hand save while %s generate job targets the chapter', async (_, status) => {
    const { tables, service } = novel({ jobs: [{ target: '3', status }] });

    await expect(service.updateDraft(7n, 3, { ...PROSE, ...base(2, 0) })).rejects.toMatchObject({ code: 'DRF_019' });
    expect(tables.writes).toEqual([]);
  });

  it.each([
    ['a bare deadlock', { code: '40P01' }],
    ['a query error caused by one', Object.assign(new Error('Failed query'), { cause: { code: 'ERR_POSTGRES_SERVER_ERROR', errno: '40P01' } })],
  ])('should answer %s as a conflict the autosave retries', async (_, deadlock) => {
    const service = makeGenerationService({ transaction: async () => Promise.reject(deadlock) });

    await expect(service.updateDraft(7n, 3, { ...PROSE, ...base(2, 0) })).rejects.toMatchObject({ code: 'DRF_013' });
    await expect(service.importDraft(7n, 3, { prose: PROSE.body, ...base(2, 0) })).rejects.toMatchObject({ code: 'DRF_013' });
  });

  it('should pass any other database failure through untouched', async () => {
    const failure = { code: 'ERR_POSTGRES_SERVER_ERROR', errno: '23505' };
    const service = makeGenerationService({ transaction: async () => Promise.reject(failure) });

    await expect(service.updateDraft(7n, 3, PROSE)).rejects.toBe(failure);
  });

  it('should refuse a hand save while the AI is writing the chapter', async () => {
    const { tables, service } = novel({ chapter3: { reviewStatus: 'generating' } });

    await expect(service.updateDraft(7n, 3, { ...PROSE, ...base(2, 0) })).rejects.toMatchObject({ code: 'DRF_019', message: expect.stringContaining('Chapter 3') });
    expect(tables.writes).toEqual([]);
  });
});

describe('GenerationService — the next writable chapter', () => {
  it('should start a new draft at the next writable chapter', async () => {
    const { tables, service } = novel();

    const draft = await service.updateDraft(7n, 4, PROSE);

    expect(draft).toMatchObject({ chapter: 4, revision: 0, generator: 'human' });
    expect(tables.revisionsOf(4)).toHaveLength(1);
  });

  it.each([
    ['PUT past the next chapter', (service: ReturnType<typeof novel>['service']) => service.updateDraft(7n, 6, PROSE), 6],
    ['import past the next chapter', (service: ReturnType<typeof novel>['service']) => service.importDraft(7n, 5, { prose: PROSE.body }), 5],
  ])('should refuse a new draft by %s', async (_, save, chapter) => {
    const { tables, service } = novel();

    await expect(save(service)).rejects.toMatchObject({ code: 'DRF_018', message: expect.stringContaining(`Only chapter 4 can be started now`) });
    expect(tables.draft(chapter)).toBeUndefined();
    expect(tables.writes).toEqual([]);
  });

  it('should refuse a new draft behind the next chapter, where a final import already stands', async () => {
    const { service } = novel({ chapters: [{ number: 4 }] });

    await expect(service.updateDraft(7n, 4, PROSE)).rejects.toMatchObject({ code: 'DRF_018', message: expect.stringContaining('Only chapter 5') });
  });

  it('should keep an existing draft editable wherever it sits', async () => {
    const { service } = novel({ later: [{ id: 6n, chapter: 6, body: 'Six, ahead of a hole.', revision: 1 }] });

    await expect(service.updateDraft(7n, 6, PROSE)).resolves.toMatchObject({ chapter: 6, revision: 2 });
  });

  it('should agree with the chat on the next chapter, counting a final import as written', async () => {
    const { tables } = novel({ chapters: [{ number: 4 }, { number: 6 }] });
    const chapters = tables.rows(schema.chapters).map(row => ({ number: row['number'], status: 'done' }));

    expect(await nextWritableChapter(tables.db as never, 7n)).toBe(5);
    expect(nextChapterNumber(chapters as never, [{ chapter: 1 }, { chapter: 2 }, { chapter: 3 }])).toBe(5);
  });
});

describe('ChapterRowsService.list', () => {
  it("should name the next writable chapter and each written row's approved revision", async () => {
    const { tables } = novel({ chapter3: { approvedRevision: 2 }, chapters: [{ number: 4 }] });

    const list = await new ChapterRowsService({ getPostgresClient: () => tables.db } as never).list(7n, { filter: 'all', limit: 25, offset: 0 });

    expect(list.nextWritableChapter).toBe(5);
    expect(list.items.map(row => [row.chapter, row.approvedRevision])).toEqual([
      [1, null],
      [2, null],
      [3, 2],
    ]);
  });
});

describe('GenerationService.startNextDraft', () => {
  it('should create an empty hand-written draft at the chapter the server chooses', async () => {
    const { tables, service } = novel({ chapters: [{ number: 4 }] });

    const draft = await service.startNextDraft(7n);

    expect(draft).toMatchObject({ chapter: 5, body: '', generator: 'human', revision: 0, reviewStatus: 'needs_review' });
    expect(tables.revisionsOf(5).map(row => row['source'])).toEqual(['hand_edited']);
  });

  it('should refuse while a generate job is writing that chapter', async () => {
    const { tables, service } = novel({ jobs: [{ target: '4,5', status: 'pending' }] });

    await expect(service.startNextDraft(7n)).rejects.toMatchObject({ code: 'DRF_019', message: expect.stringContaining('Chapter 4') });
    expect(tables.draft(4)).toBeUndefined();
  });

  it('should start the chapter while a generate job writes a different one', async () => {
    const { service } = novel({ jobs: [{ target: '7', status: 'in_progress' }] });

    await expect(service.startNextDraft(7n)).resolves.toMatchObject({ chapter: 4 });
  });

  it('should refuse rather than overwrite a draft that landed first, answering with that draft', async () => {
    const { tables } = novel({ later: [{ id: 9n, chapter: 4, body: 'Written in the other tab.', revision: 0 }] });

    const conflict = await conflictOf(insertHandWrittenDraft(tables.db as never, { projectId: 7n, chapter: 4, source: 'hand_edited', fields: { body: '' } }));

    expect(conflict.toResponse().current.body).toBe('Written in the other tab.');
    expect(tables.draft(4)?.['body']).toBe('Written in the other tab.');
  });
});

describe('GenerationService — approvedRevision', () => {
  it('should keep the approved revision through a later edit and replace it on the next approval', async () => {
    const { tables, service } = novel();

    await expect(service.approveDraft(7n, 3, { revision: 2, saveSeq: 0, draftId: 3n })).resolves.toMatchObject({ approvedRevision: 2, reviewStatus: 'approved' });
    await expect(service.updateDraft(7n, 3, { ...EDITED, ...base(2, 0) })).resolves.toMatchObject({
      revision: 3,
      approvedRevision: 2,
      reviewStatus: 'needs_review',
    });
    await service.approveDraft(7n, 3, { revision: 3, saveSeq: 1, draftId: 3n });

    expect(tables.draft(3)).toMatchObject({ revision: 3, approvedRevision: 3 });
  });

  it('should refuse an approval of text another save changed since the author read it', async () => {
    const { tables, service } = novel({ chapter3: { saveSeq: 4 } });

    await expect(service.approveDraft(7n, 3, { revision: 2, saveSeq: 3, draftId: 3n })).rejects.toMatchObject({ code: 'DRF_013' });
    expect(tables.draft(3)).toMatchObject({ reviewStatus: 'needs_review', approvedRevision: null });
  });

  it('should refuse an approval read from a draft that was deleted and started again', async () => {
    const { tables, service } = novel({ chapter3: { revision: 0 } });
    await service.deleteDraft(7n, 3);
    await service.updateDraft(7n, 3, PROSE);

    await expect(service.approveDraft(7n, 3, { revision: 0, saveSeq: 0, draftId: 3n })).rejects.toMatchObject({ code: 'DRF_013' });
    expect(tables.draft(3)).toMatchObject({ reviewStatus: 'needs_review', approvedRevision: null });
  });

  it('should start a deleted chapter over with no approval behind it', async () => {
    const { service } = novel({ chapter3: { approvedRevision: 2, reviewStatus: 'approved' } });

    await service.deleteDraft(7n, 3);

    await expect(service.updateDraft(7n, 3, PROSE)).resolves.toMatchObject({ chapter: 3, approvedRevision: null });
  });
});

/** Chapter 3 at revision 4, the author's own edit from a moment ago, with chapter 4 already marked stale by it. */
function editing(overrides: { chapter3?: Row; revision?: Row; chapter4?: Row; reviews?: readonly Row[] } = {}) {
  return novel({
    chapter3: { revision: 4, saveSeq: 7, generator: 'human', ...overrides.chapter3 },
    later: [{ id: 5n, chapter: 4, body: 'Four.', revision: 1, staleReason: 'ancestor chapter 3 was hand_edited', ...overrides.chapter4 }],
    revisions: [{ draftId: 3n, revision: 4, source: 'hand_edited', body: 'The keeper counts the ships.', ...overrides.revision }],
    reviews: overrides.reviews,
  });
}

describe('GenerationService — autosave folding', () => {
  it('should fold a consecutive hand save into the revision it continues, with no new history row', async () => {
    const { tables, service } = editing();

    const draft = await service.updateDraft(7n, 3, { ...EDITED, ...base(4, 7) });

    expect(draft).toMatchObject({ revision: 4, saveSeq: 8, body: EDITED.body });
    expect(tables.revisionsOf(3).map(row => [row['revision'], row['body']])).toEqual([[4, EDITED.body]]);
    expect(tables.writes.map(write => [write.table === schema.drafts ? 'drafts' : write.table === schema.draftRevisions ? 'revisions' : 'other', write.kind])).toEqual([
      ['drafts', 'update'],
      ['revisions', 'update'],
    ]);
  });

  it('should still mark a later draft refreshed since the revision began, as the cascade runs on every save', async () => {
    const { tables, service } = editing({ chapter4: { staleReason: null, reviewStatus: 'approved' } });

    const draft = await service.updateDraft(7n, 3, { ...EDITED, ...base(4, 7) });

    expect(draft).toMatchObject({ revision: 4, saveSeq: 8 });
    expect(tables.draft(4)).toMatchObject({ staleReason: 'ancestor chapter 3 was hand_edited', reviewStatus: 'needs_review' });
  });

  it('should open one revision on the first save and fold the saves after it', async () => {
    const { tables, service } = novel({ later: [{ id: 5n, chapter: 4, body: 'Four.', revision: 1, reviewStatus: 'approved' }] });

    const { revision, saveSeq } = await service.updateDraft(7n, 3, { ...EDITED, ...base(2, 0) });
    const second = await service.updateDraft(7n, 3, { ...EDITED, body: 'And the tide turns twice.', ...base(revision, saveSeq) });

    expect({ revision, saveSeq }).toEqual({ revision: 3, saveSeq: 1 });
    expect(second).toMatchObject({ revision: 3, saveSeq: 2, body: 'And the tide turns twice.' });
    expect(tables.draft(4)).toMatchObject({ staleReason: 'ancestor chapter 3 was hand_edited', reviewStatus: 'needs_review' });
    expect(tables.revisionsOf(3).map(row => row['revision'])).toEqual([2, 3]);
  });

  it("should refuse another tab's save against the folded revision's older save sequence, with the folded text", async () => {
    const { tables, service } = editing();
    await service.updateDraft(7n, 3, { ...EDITED, ...base(4, 7) });

    const conflict = await conflictOf(service.updateDraft(7n, 3, { ...PROSE, ...base(4, 7) }));

    expect(conflict.toResponse().current).toMatchObject({ revision: 4, saveSeq: 8, body: EDITED.body });
    expect(tables.draft(3)?.['body']).toBe(EDITED.body);
  });

  it('should refuse a save that names only the revision after a fold, rather than let it win', async () => {
    const { tables, service } = editing();
    await service.updateDraft(7n, 3, { ...EDITED, ...base(4, 7) });

    await expect(service.updateDraft(7n, 3, { ...PROSE, baseRevision: 4 })).rejects.toMatchObject({ code: 'DRF_020' });
    expect(tables.draft(3)?.['body']).toBe(EDITED.body);
  });

  it('should write nothing for a save that changes nothing', async () => {
    const { tables, service } = editing({ chapter3: { reviewStatus: 'approved', approvedRevision: 4 } });

    await expect(service.updateDraft(7n, 3, { body: 'The keeper counts the ships.', ...base(4, 7) })).resolves.toMatchObject({ reviewStatus: 'approved' });
    expect(tables.writes).toEqual([]);
  });

  it('should clear the judge verdict of the text a hand save replaced', async () => {
    const { service } = editing({ chapter3: { judge: 'contradiction', judgeNote: '[hard] The lanterns.' } });

    await expect(service.updateDraft(7n, 3, { ...EDITED, ...base(4, 7) })).resolves.toMatchObject({ judge: null, judgeNote: null });
  });

  it.each([
    ['the save carries no base', {}, false],
    ['the revision was approved since', { chapter3: { approvedRevision: 4 } }, true],
    ['the revision is approved', { chapter3: { approvedRevision: 4, reviewStatus: 'approved' } }, true],
    ['the revision was reviewed', { reviews: [{ chapter: 3, draftRevision: 4, bodyHash: 'h', findings: [] }] }, true],
    ['the revision is older than the window', { revision: { recent: false } }, true],
    ['the revision came from generation', { revision: { source: 'generated' } }, true],
    ['the draft went stale since', { chapter3: { staleReason: 'ancestor chapter 2 was hand_edited' } }, true],
  ] as const)('should open a new revision, with the full cascade, when %s', async (_, setup, based) => {
    const { tables, service } = editing({ ...setup, chapter4: { staleReason: null } });

    const draft = await service.updateDraft(7n, 3, { ...EDITED, ...(based ? base(4, 7) : {}) });

    expect(draft).toMatchObject({ revision: 5, saveSeq: 8, reviewStatus: 'needs_review', staleReason: null });
    expect(tables.revisionsOf(3).map(row => row['revision'])).toEqual([4, 5]);
    expect(tables.draft(4)?.['staleReason']).toBe('ancestor chapter 3 was hand_edited');
  });
});

describe('GenerationService.finalizeReadiness', () => {
  const approved = { reviewStatus: 'approved', approvedRevision: 2 };
  const allChaptersFinal = (drafts: number[]) =>
    drafts.map(chapter => ({ id: BigInt(chapter), chapter, body: `${chapter}.`, revision: 1, status: 'final', reviewStatus: 'final' }));

  function finalizing(chapter3: Row, seed: Omit<DraftSeed, 'drafts'> = {}) {
    const tables = draftTables({ ...seed, drafts: [...allChaptersFinal([1, 2]), { id: 3n, chapter: 3, body: 'The keeper counts the ships.', revision: 2, ...chapter3 }] });
    return { tables, service: makeGenerationService(tables.db) };
  }

  it('should answer ready when finalize would run', async () => {
    const { service } = finalizing(approved);

    await expect(service.finalizeReadiness(7n, 3)).resolves.toEqual({ ready: true, blockers: [] });
  });

  it('should list every reason finalize would refuse, in the order it checks them', async () => {
    const { tables, service } = finalizing(
      { isolated: true, summary: null, staleReason: 'ancestor chapter 2 was hand_edited' },
      {
        reviews: [{ chapter: 3, draftRevision: 2, bodyHash: hashReviewedBody('The keeper counts the ships.'), findings: [{ id: 'f1', severity: 'blocking' }] }],
        chapters: [{ number: 1, needsRevalidation: true }],
        reports: [{ payload: { issues: [{ chapter: 3, severity: 'error' }] } }],
      },
    );
    tables.rows(schema.drafts).splice(1, 1);

    const readiness = await service.finalizeReadiness(7n, 3);

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map(blocker => blocker.code)).toEqual(['DRF_004', 'DRF_007', 'FIN_004', 'CHP_005', 'FIN_001', 'FIN_002', 'FIN_003']);
    expect(readiness.blockers[2]?.message).toContain('Chapter 3 has a blocking review finding still open');
  });

  it('should report the authoring work that holds the novel, as finalize would refuse to start beside it', async () => {
    const claims = new FakeAuthoringClaims();
    await claims.acquire(7n, 'job-1', 'generate');
    const tables = draftTables({ drafts: [...allChaptersFinal([1, 2]), { id: 3n, chapter: 3, body: 'x', revision: 2, ...approved }] });

    await expect(makeGenerationService(tables.db, { claims }).finalizeReadiness(7n, 3)).resolves.toEqual({
      ready: false,
      blockers: [{ code: 'JOB_002', message: expect.stringContaining('being written, planned or finalized') }],
    });
  });

  it('should refuse finalize with the first reason readiness lists', async () => {
    const { service } = finalizing({ reviewStatus: 'needs_review' });

    const [first] = (await service.finalizeReadiness(7n, 3)).blockers;

    await expect(service.finalize(7n, { chapter: 3 })).rejects.toMatchObject({ code: first?.code });
  });

  it('should refuse a chapter that finished finalizing', async () => {
    const { service } = finalizing({ status: 'final', reviewStatus: 'final' }, { chapters: [{ number: 3, continuityApplied: true }], storyCurrentChapter: 3 });

    await expect(service.finalizeReadiness(7n, 3)).resolves.toMatchObject({ ready: false, blockers: [{ code: 'DRF_002' }] });
  });
});
