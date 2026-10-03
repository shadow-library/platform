/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { expect, test } from './forge-actors';
import { expectCode } from './forge-arrange';
import { listDispatchedModelCalls } from './forge-db';
import { importDraft, startNextChapter, writeChapterByHand } from './forge-helpers';
import { approveAsRead, createGuardedProject, finalizeChapterNoReview, readStaleDraft, restoreVersionAsRead } from './forge-story';

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

/**
 * Declaring the constants
 */

function versionsPath(projectId: string, chapter: number, suffix = ''): string {
  return `/api/v1/projects/${projectId}/drafts/${chapter}/versions${suffix}`;
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
});
