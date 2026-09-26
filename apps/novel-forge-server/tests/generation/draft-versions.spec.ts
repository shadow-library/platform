import { describe, expect, it } from 'bun:test';

import { DraftVersionService } from '@modules/generation/draft-versions.service';
import { DraftConflictError } from '@server/classes';
import { DRAFT_HISTORY_LIMIT } from '@server/common';

import { type DraftSeed, draftTables } from './draft-tables';
import { makeGenerationService } from './generation-fixtures';

type Row = Record<string, unknown>;

const FIRST = 'The keeper counts the ships.';
const SECOND = 'The keeper counts the boats.';
const THIRD = 'The keeper counts nothing at all.';

/** Chapter 3 is approved at revision 3 with a full history; chapter 4 was written after it. */
function novel(overrides: { chapter3?: Row; revisions?: readonly Row[] } & Omit<DraftSeed, 'drafts' | 'revisions'> = {}) {
  const { chapter3, revisions, ...seed } = overrides;
  const tables = draftTables({
    ...seed,
    drafts: [
      { id: 3n, chapter: 3, body: THIRD, summary: 'The count stops.', revision: 3, approvedRevision: 3, reviewStatus: 'approved', generator: 'standard', ...chapter3 },
      { id: 4n, chapter: 4, body: 'Four.', revision: 1 },
    ],
    revisions: revisions ?? [
      { draftId: 3n, revision: 1, source: 'generated', body: FIRST, summary: 'The count begins.', isolated: false, restoredFrom: null },
      { draftId: 3n, revision: 2, source: 'hand_edited', body: SECOND, summary: 'The count changes.', isolated: false, restoredFrom: null },
      { draftId: 3n, revision: 3, source: 'revised', body: THIRD, summary: 'The count stops.', isolated: false, restoredFrom: null },
    ],
  });
  return { tables, service: new DraftVersionService({ getPostgresClient: () => tables.db } as never) };
}

describe('DraftVersionService.restore', () => {
  it('should restore an earlier version as a new revision without rewriting history', async () => {
    const { tables, service } = novel();

    const draft = await service.restore(7n, 3, 1, undefined);

    expect(draft).toMatchObject({ revision: 4, body: FIRST, summary: 'The count begins.', saveSeq: 1 });
    expect(tables.revisionsOf(3).map(row => [row['revision'], row['source'], row['body'], row['restoredFrom']])).toEqual([
      [1, 'generated', FIRST, null],
      [2, 'hand_edited', SECOND, null],
      [3, 'revised', THIRD, null],
      [4, 'restored', FIRST, 1],
    ]);
  });

  it('should invalidate the approval and mark later drafts stale, as an edit does', async () => {
    const { tables, service } = novel();

    await service.restore(7n, 3, 2, undefined);

    expect(tables.draft(3)).toMatchObject({ reviewStatus: 'needs_review', approvedRevision: 3, revision: 4 });
    expect(tables.draft(4)?.['staleReason']).toBe('ancestor chapter 3 was restored to an earlier version');
  });

  it('should refuse to restore a final chapter with a reason, changing nothing', async () => {
    const { tables, service } = novel({ chapter3: { status: 'final', reviewStatus: 'final' } });

    await expect(service.restore(7n, 3, 1, undefined)).rejects.toMatchObject({ code: 'VER_002' });
    expect(tables.writes).toEqual([]);
  });

  it('should refuse a restore made against an older read of the draft with the current draft', async () => {
    const { tables, service } = novel({ chapter3: { saveSeq: 5 } });

    const error = await service.restore(7n, 3, 1, { draftId: 3n, revision: 3, saveSeq: 4 }).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(DraftConflictError);
    expect(tables.writes).toEqual([]);
  });

  it('should refuse a version that is not stored', async () => {
    const { tables, service } = novel();

    await expect(service.restore(7n, 3, 9, undefined)).rejects.toMatchObject({ code: 'VER_001' });
    expect(tables.writes).toEqual([]);
  });

  it('should keep a restored draft walled off when the version it brings back was isolated', async () => {
    const { tables, service } = novel({
      revisions: [{ draftId: 3n, revision: 1, source: 'generated', body: FIRST, isolated: true }],
    });

    await service.restore(7n, 3, 1, undefined);

    expect(tables.draft(3)?.['isolated']).toBe(true);
    expect(tables.revisionsOf(3).find(row => row['revision'] === 4)?.['isolated']).toBe(true);
  });

  it('should record the current text before restoring over it when no history row holds it', async () => {
    const { tables, service } = novel({ revisions: [{ draftId: 3n, revision: 1, source: 'generated', body: FIRST }] });

    await service.restore(7n, 3, 1, undefined);

    expect(tables.revisionsOf(3).map(row => [row['revision'], row['body']])).toEqual([
      [1, FIRST],
      [3, THIRD],
      [4, FIRST],
    ]);
  });

  it('should change nothing when the version holds the text the draft already has', async () => {
    const { tables, service } = novel({ revisions: [{ draftId: 3n, revision: 1, source: 'generated', body: THIRD, summary: 'The count stops.' }] });

    const draft = await service.restore(7n, 3, 1, undefined);

    expect(draft).toMatchObject({ revision: 3, reviewStatus: 'approved' });
    expect(tables.writes).toEqual([]);
  });

  it('should restore the title and state a version recorded, and keep the current ones where it recorded none', async () => {
    const withTitle = novel({
      chapter3: { title: 'Now', state: { mood: 'now' } },
      revisions: [{ draftId: 3n, revision: 1, source: 'generated', body: FIRST, title: 'Then', state: { mood: 'then' } }],
    });
    const without = novel({
      chapter3: { title: 'Now', state: { mood: 'now' } },
      revisions: [{ draftId: 3n, revision: 1, source: 'generated', body: FIRST, title: null, state: null }],
    });

    const restored = await withTitle.service.restore(7n, 3, 1, undefined);
    const kept = await without.service.restore(7n, 3, 1, undefined);

    expect(restored).toMatchObject({ title: 'Then', state: { mood: 'then' }, body: FIRST });
    expect(kept).toMatchObject({ title: 'Now', state: { mood: 'now' }, body: FIRST });
  });

  it('should need approving again after restoring the approved revision', async () => {
    const { tables, service } = novel({ chapter3: { revision: 4, body: 'Later text.' }, revisions: [{ draftId: 3n, revision: 3, source: 'revised', body: THIRD }] });

    await service.restore(7n, 3, 3, undefined);

    expect(tables.draft(3)).toMatchObject({ revision: 5, body: THIRD, approvedRevision: 3, reviewStatus: 'needs_review' });
  });

  it('should keep the newest history and the approved revision once the history is full', async () => {
    const newest = DRAFT_HISTORY_LIMIT + 5;
    const revisions = Array.from({ length: newest }, (_, n) => ({ draftId: 3n, revision: n + 1, source: 'hand_edited', body: `v${n + 1}` }));
    const { tables, service } = novel({ chapter3: { revision: newest, approvedRevision: 2 }, revisions });

    await service.restore(7n, 3, 3, undefined);

    const kept = tables.revisionsOf(3).map(row => row['revision'] as number);
    expect(kept).toHaveLength(DRAFT_HISTORY_LIMIT + 1);
    expect(kept).toContain(2);
    expect(Math.min(...kept.filter(revision => revision !== 2))).toBe(newest + 1 - DRAFT_HISTORY_LIMIT + 1);
  });
});

describe('DraftVersionService.list', () => {
  it('should list versions newest first with their cause, the current and the approved one', async () => {
    const { service } = novel();

    const versions = await service.list(7n, 3);

    expect(versions.map(version => [version.revision, version.source, version.current, version.approved])).toEqual([
      [3, 'revised', true, true],
      [2, 'hand_edited', false, false],
      [1, 'generated', false, false],
    ]);
  });

  it('should list current text with no history row as an unrecorded current version', async () => {
    const { service } = novel({ revisions: [{ draftId: 3n, revision: 1, source: 'generated', body: FIRST }] });

    const [current] = await service.list(7n, 3);

    expect(current).toMatchObject({ revision: 3, source: null, current: true });
  });
});

describe('DraftVersionService.compare', () => {
  it('should diff two versions word by word', async () => {
    const { service } = novel();

    const comparison = await service.compare(7n, 3, 1, 2);

    expect(comparison).toMatchObject({ from: 1, to: 2, wordsAdded: 1, wordsRemoved: 1 });
    expect(comparison.hunks).toEqual([
      { op: 'equal', text: 'The keeper counts the ' },
      { op: 'delete', text: 'ships.' },
      { op: 'insert', text: 'boats.' },
    ]);
  });

  it('should compare against the current text when no history row holds it', async () => {
    const { service } = novel({ revisions: [{ draftId: 3n, revision: 2, source: 'generated', body: SECOND }] });

    const comparison = await service.compare(7n, 3, 2, 3);

    expect(comparison).toMatchObject({ wordsAdded: 3, wordsRemoved: 2 });
  });
});

describe('isolated versions on author routes', () => {
  const isolatedHistory = {
    chapter3: { isolated: true },
    revisions: [
      { draftId: 3n, revision: 1, source: 'generated', body: 'The vault opens in the dark.', summary: 'The count begins.', isolated: true },
      { draftId: 3n, revision: 2, source: 'hand_edited', body: 'The vault opens at dawn.', summary: 'The count changes.', isolated: true },
    ],
  };

  it('should compare isolated prose as it stands, as the author reads the draft itself', async () => {
    const { service } = novel(isolatedHistory);

    const comparison = await service.compare(7n, 3, 1, 2);

    expect(comparison.hunks).toEqual([
      { op: 'equal', text: 'The vault opens ' },
      { op: 'delete', text: 'in the dark.' },
      { op: 'insert', text: 'at dawn.' },
    ]);
  });

  it('should flag each version by the isolation it was recorded under', async () => {
    const { service } = novel({ ...isolatedHistory, chapter3: { isolated: false } });

    const versions = await service.list(7n, 3);

    expect(versions.map(version => [version.revision, version.isolated])).toEqual([
      [3, false],
      [2, true],
      [1, true],
    ]);
  });

  it('should read an isolated revision by number as it was written', async () => {
    const { tables } = novel(isolatedHistory);

    const revision = await makeGenerationService(tables.db).getRevision(7n, 3, 1);

    expect(revision.body).toBe('The vault opens in the dark.');
  });
});
