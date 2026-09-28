/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, test } from './forge-actors';
import { expectCode } from './forge-arrange';
import { assertSpendGuarded, listDispatchedModelCalls } from './forge-db';
import { type Draft, importDraft, readDraft, saveChapter, startNextChapter, writeChapterByHand } from './forge-helpers';
import { applySuggestionAsRead, approveAsRead, createGuardedProject, finalizeChapterNoReview, readStaleDraft, restoreVersionAsRead } from './forge-story';

/**
 * Defining types
 */

interface DraftVersion {
  readonly revision: number;
  readonly source: string | null;
  readonly restoredFrom: number | null;
  readonly current: boolean;
  readonly approved: boolean;
}

interface VersionComparison {
  readonly from: number;
  readonly to: number;
  readonly wordsAdded: number;
  readonly wordsRemoved: number;
}

interface PassageSuggestion {
  readonly id: string;
  readonly status: string;
}

const ANCHOR_CONTEXT_CHARS = 32;

/**
 * Declaring the constants
 *
 * Version history and passage suggestions, both written through the hand-save path (`draft-versions.service.ts`,
 * `passage-rewrite.service.ts`). A suggestion is DB-inserted as `open`, since making one for real spends a model call under the fail-pin.
 */

function versionsPath(projectId: string, chapter: number, suffix = ''): string {
  return `/api/v1/projects/${projectId}/drafts/${chapter}/versions${suffix}`;
}

function passagesPath(projectId: string, chapter: number, suffix = ''): string {
  return `/api/v1/projects/${projectId}/drafts/${chapter}/passage-suggestions${suffix}`;
}

async function insertOpenSuggestion(projectId: string, draft: Draft, start: number, end: number, replacement: string): Promise<string> {
  const body = draft.body ?? '';
  const passage = body.slice(start, end);
  const contextBefore = body.slice(Math.max(0, start - ANCHOR_CONTEXT_CHARS), start);
  const contextAfter = body.slice(end, end + ANCHOR_CONTEXT_CHARS);
  const sql = novelForgeDb();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO passage_suggestions (
      project_id, draft_id, chapter, base_revision, base_save_seq, anchor_start, anchor_end, passage_hash, passage, context_before, context_after,
      isolated, request, replacement
    )
    VALUES (
      ${projectId}, ${draft.id}, ${draft.chapter}, ${draft.revision}, ${draft.saveSeq}, ${start}, ${end}, ${createHash('sha256').update(passage).digest('hex')}, ${passage},
      ${contextBefore}, ${contextAfter}, false, 'e2e: make it more vivid', ${replacement}
    )
    RETURNING id::text
  `;
  expect(row, 'the open suggestion row was inserted').toBeDefined();
  return row!.id;
}

test.describe('novel-forge draft versions', () => {
  test('should list, compare and restore chapter versions, refusing an unknown revision or a final chapter', async ({ forge }) => {
    const owner = await forge.actor({ label: 'versions' });
    const projectId = await createGuardedProject(forge, owner, 'versions');

    const empty = await startNextChapter(owner.ctx, projectId);
    const v1 = await importDraft(owner.ctx, projectId, empty, { body: 'The lamplighter watched her from the corner every dawn.', title: 'First cut' });
    expect(v1.revision).toBe(1);
    const v2 = await importDraft(owner.ctx, projectId, v1, { body: 'The lamplighter watched her from the corner every dawn, then vanished.', title: 'Second cut' });
    expect(v2.revision).toBe(2);

    const listed = (await (await owner.ctx.get(versionsPath(projectId, 1))).json()) as { items: DraftVersion[] };
    expect(listed.items.map(item => item.revision)).toEqual([2, 1, 0]);
    expect(listed.items[0]).toMatchObject({ current: true, source: 'imported' });
    expect(listed.items[2]).toMatchObject({ revision: 0, source: 'hand_edited' });

    const compared = (await (await owner.ctx.get(versionsPath(projectId, 1, '/compare?from=0&to=2'))).json()) as VersionComparison;
    expect(compared).toMatchObject({ from: 0, to: 2 });
    expect(compared.wordsAdded).toBeGreaterThan(0);

    await expectCode(await owner.ctx.get(versionsPath(projectId, 1, '/compare?from=0&to=99')), 404, 'VER_001', 'comparing against an unknown revision');
    await expectCode(await mutate(owner.ctx, 'post', versionsPath(projectId, 1, '/99/restore'), { data: {} }), 404, 'VER_001', 'restoring an unknown revision');

    const staleBase = await mutate(owner.ctx, 'post', versionsPath(projectId, 1, '/1/restore'), {
      data: { baseDraftId: v2.id, baseRevision: 0, baseSaveSeq: v2.saveSeq },
    });
    await expectCode(staleBase, 409, 'DRF_013', 'restoring against a base that has moved on');

    const restored = await restoreVersionAsRead(owner.ctx, projectId, 1, 1, v2);
    expect(restored.body).toBe(v1.body);
    expect(restored.revision).toBe(3);
    const afterRestore = (await (await owner.ctx.get(versionsPath(projectId, 1))).json()) as { items: DraftVersion[] };
    expect(afterRestore.items[0]).toMatchObject({ revision: 3, source: 'restored', restoredFrom: 1, current: true });

    const noop = await restoreVersionAsRead(owner.ctx, projectId, 1, 3, restored);
    expect(noop.revision, 'restoring the current text again changes nothing').toBe(3);
    const stillThree = (await (await owner.ctx.get(versionsPath(projectId, 1))).json()) as { items: DraftVersion[] };
    expect(stillThree.items.map(item => item.revision)).toEqual([3, 2, 1, 0]);
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });

  test('should mark later drafts stale when an earlier one is restored, and refuse restoring a final chapter', async ({ forge }) => {
    const owner = await forge.actor({ label: 'versions-cascade' });
    const projectId = await createGuardedProject(forge, owner, 'versions-cascade');

    const chapterOne = await writeChapterByHand(owner.ctx, projectId, { title: 'One', body: 'Chapter one, first telling.' });
    const olderBody = 'Chapter one, an even older telling.';
    const v1 = await importDraft(owner.ctx, projectId, chapterOne, { body: olderBody, title: 'One (older)' });
    const v2 = await importDraft(owner.ctx, projectId, v1, { body: 'Chapter one, the current telling.', title: 'One (current)' });

    const chapterTwo = await writeChapterByHand(owner.ctx, projectId, { title: 'Two', body: 'Chapter two follows on.' });
    const approvedTwo = await approveAsRead(owner.ctx, projectId, chapterTwo);
    expect(approvedTwo.reviewStatus).toBe('approved');

    const restored = await restoreVersionAsRead(owner.ctx, projectId, 1, v1.revision, v2);
    expect(restored.body).toBe(olderBody);
    const staleTwo = await readStaleDraft(owner.ctx, projectId, 2);
    expect(staleTwo.staleReason).toBe('ancestor chapter 1 was restored to an earlier version');
    expect(staleTwo.reviewStatus).toBe('needs_review');

    const finalProjectId = await createGuardedProject(forge, owner, 'versions-final');
    const finalDraft = await writeChapterByHand(owner.ctx, finalProjectId, {
      title: 'Final',
      body: 'Prose that will finalize.',
      summary: 'A chapter that finalizes.',
    });
    const final = await finalizeChapterNoReview(owner.ctx, finalProjectId, finalDraft);
    expect(final.status).toBe('final');

    await expectCode(await mutate(owner.ctx, 'post', versionsPath(finalProjectId, 1, '/0/restore'), { data: {} }), 400, 'VER_002', 'restoring a final chapter');
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
    expect(await listDispatchedModelCalls(finalProjectId), 'no real model call was made').toEqual([]);
  });
});

test.describe('novel-forge passage suggestions', () => {
  test('should refuse a request whose range is outside the text or whose hash no longer matches', async ({ forge }) => {
    const owner = await forge.actor({ label: 'passage-refusals' });
    const projectId = await createGuardedProject(forge, owner, 'passage-refusals');
    const draft = await writeChapterByHand(owner.ctx, projectId, {
      title: 'One',
      body: 'Alpha beta gamma delta epsilon zeta eta theta.',
    });

    await assertSpendGuarded(projectId);
    const outOfBounds = await mutate(owner.ctx, 'post', passagesPath(projectId, 1), {
      data: { baseDraftId: draft.id, baseRevision: draft.revision, baseSaveSeq: draft.saveSeq, start: 0, end: 9999, passageHash: 'a'.repeat(64), request: 'punch it up' },
    });
    await expectCode(outOfBounds, 400, 'PSG_002', 'a selection past the end of the chapter');

    const wrongHash = await mutate(owner.ctx, 'post', passagesPath(projectId, 1), {
      data: { baseDraftId: draft.id, baseRevision: draft.revision, baseSaveSeq: draft.saveSeq, start: 6, end: 10, passageHash: 'a'.repeat(64), request: 'punch it up' },
    });
    await expectCode(wrongHash, 409, 'PSG_003', 'a passage hash that no longer matches the text at those offsets');
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });

  test('should refuse a passage request on a final chapter before reaching the model', async ({ forge }) => {
    const owner = await forge.actor({ label: 'passage-final' });
    const projectId = await createGuardedProject(forge, owner, 'passage-final');
    const draft = await writeChapterByHand(owner.ctx, projectId, {
      title: 'One',
      body: 'A settled sentence.',
      summary: 'A chapter that settles.',
    });
    const final = await finalizeChapterNoReview(owner.ctx, projectId, draft);

    await assertSpendGuarded(projectId);
    const refused = await mutate(owner.ctx, 'post', passagesPath(projectId, 1), {
      data: { baseDraftId: final.id, baseRevision: final.revision, baseSaveSeq: final.saveSeq, start: 0, end: 4, passageHash: '0'.repeat(64), request: 'x' },
    });
    await expectCode(refused, 400, 'PSG_006', 'requesting a passage rewrite on a final chapter');
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });

  test('should apply an open suggestion through the hand-save path, and refuse a stale, repeat or unknown one', async ({ forge }) => {
    const owner = await forge.actor({ label: 'passage-apply' });
    const projectId = await createGuardedProject(forge, owner, 'passage-apply');
    const draft = await writeChapterByHand(owner.ctx, projectId, {
      title: 'One',
      body: 'Alpha beta gamma delta epsilon zeta eta theta.',
    });
    const start = draft.body!.indexOf('gamma');
    const end = start + 'gamma'.length;
    const suggestionId = await insertOpenSuggestion(projectId, draft, start, end, 'GAMMA-REWRITTEN');

    const applied = await applySuggestionAsRead(owner.ctx, projectId, 1, suggestionId, draft);
    expect(applied.body).toContain('GAMMA-REWRITTEN');
    expect(applied.body).not.toContain('gamma');
    const versions = (await (await owner.ctx.get(versionsPath(projectId, 1))).json()) as { items: DraftVersion[] };
    expect(versions.items[0], 'applying a suggestion lands through the hand-save path as a passage_rewritten revision').toMatchObject({
      revision: applied.revision,
      source: 'passage_rewritten',
      current: true,
    });

    const listAfter = (await (await owner.ctx.get(passagesPath(projectId, 1))).json()) as { items: PassageSuggestion[] };
    expect(listAfter.items.find(item => item.id === suggestionId)).toBeUndefined();

    const reappliedResponse = await mutate(owner.ctx, 'post', passagesPath(projectId, 1, `/${suggestionId}/apply`), { data: {} });
    await expectCode(reappliedResponse, 409, 'PSG_005', 'applying an already-applied suggestion');

    const secondDraft = await readDraft(owner.ctx, projectId, 1);
    const secondStart = secondDraft.body!.indexOf('delta');
    const secondSuggestionId = await insertOpenSuggestion(projectId, secondDraft, secondStart, secondStart + 'delta'.length, 'DELTA-REWRITTEN');
    await saveChapter(owner.ctx, projectId, secondDraft, { title: 'One', body: 'A completely different sentence with no trace of the old words.' });

    const stale = await mutate(owner.ctx, 'post', passagesPath(projectId, 1, `/${secondSuggestionId}/apply`), { data: {} });
    await expectCode(stale, 409, 'PSG_004', 'applying a suggestion whose passage moved or changed');

    await expectCode(await mutate(owner.ctx, 'post', passagesPath(projectId, 1, '/999999999/apply'), { data: {} }), 404, 'PSG_001', 'applying an unknown suggestion');
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });

  test('should dismiss an open suggestion and refuse dismissing it twice or an unknown one', async ({ forge }) => {
    const owner = await forge.actor({ label: 'passage-dismiss' });
    const projectId = await createGuardedProject(forge, owner, 'passage-dismiss');
    const draft = await writeChapterByHand(owner.ctx, projectId, {
      title: 'One',
      body: 'Alpha beta gamma delta epsilon zeta eta theta.',
    });
    const start = draft.body!.indexOf('epsilon');
    const suggestionId = await insertOpenSuggestion(projectId, draft, start, start + 'epsilon'.length, 'EPSILON-REWRITTEN');

    const dismissed = await mutate(owner.ctx, 'post', passagesPath(projectId, 1, `/${suggestionId}/dismiss`));
    expect(dismissed.status(), await dismissed.text()).toBe(200);
    expect((await dismissed.json()) as PassageSuggestion).toMatchObject({ status: 'dismissed' });

    await expectCode(await mutate(owner.ctx, 'post', passagesPath(projectId, 1, `/${suggestionId}/dismiss`)), 409, 'PSG_005', 'dismissing an already-closed suggestion');
    await expectCode(await mutate(owner.ctx, 'post', passagesPath(projectId, 1, '/999999999/dismiss')), 404, 'PSG_001', 'dismissing an unknown suggestion');
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });
});

test.describe('novel-forge chapter-workspace response bodies', () => {
  test('should answer a restore with the restored draft', async ({ forge }) => {
    const owner = await forge.actor({ label: 'versions-response' });
    const projectId = await createGuardedProject(forge, owner, 'versions-response');
    const empty = await startNextChapter(owner.ctx, projectId);
    const v1 = await importDraft(owner.ctx, projectId, empty, { body: 'First telling.', title: 'One' });
    const v2 = await importDraft(owner.ctx, projectId, v1, { body: 'Second telling.', title: 'One' });

    const restore = await mutate(owner.ctx, 'post', versionsPath(projectId, 1, '/1/restore'), {
      data: { baseDraftId: v2.id, baseRevision: v2.revision, baseSaveSeq: v2.saveSeq },
    });
    expect(restore.status(), await restore.text()).toBe(200);
    expect(await restore.json()).toMatchObject({ body: 'First telling.', revision: 3 });
  });

  test('should answer applying a suggestion with the updated draft and suggestion', async ({ forge }) => {
    const owner = await forge.actor({ label: 'passage-response' });
    const projectId = await createGuardedProject(forge, owner, 'passage-response');
    const draft = await writeChapterByHand(owner.ctx, projectId, { title: 'One', body: 'Alpha beta gamma.' });
    const start = draft.body!.indexOf('gamma');
    const suggestionId = await insertOpenSuggestion(projectId, draft, start, start + 'gamma'.length, 'GAMMA-REWRITTEN');

    const applied = await mutate(owner.ctx, 'post', passagesPath(projectId, 1, `/${suggestionId}/apply`), { data: {} });
    expect(applied.status(), await applied.text()).toBe(200);
    expect(await applied.json()).toMatchObject({ draft: { body: 'Alpha beta GAMMA-REWRITTEN.' }, suggestion: { status: 'applied' } });
  });
});
