/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, test } from './forge-actors';
import { expectCode } from './forge-arrange';
import { assertSpendGuarded, holdAuthoringClaim, listDispatchedModelCalls, releaseAuthoringClaim } from './forge-db';
import { CHAPTER_ONE, expectCommittedDespiteSerializerBug, importDraft, pollJobStatus, saveChapter, startNextChapter, uniqueSuffix, writeChapterByHand } from './forge-helpers';
import {
  approveAsRead,
  countApprovals,
  createGuardedProject,
  insertContinuityProposal,
  insertFinalDraft,
  readFinalizeReviewStatus,
  readStaleDraft,
  writeBrief,
} from './forge-story';

/**
 * Defining types
 */

interface DraftSummaryItem {
  readonly chapter: number;
  readonly stale: boolean;
  readonly writtenAt: string;
  readonly body?: string;
}

interface JobEnqueueResponse {
  readonly jobId: string;
  readonly target: string;
}

/**
 * Declaring the constants
 *
 * Hand saves, imports and deletes as the draft-save path enforces them (`draft-save.ts`), approval binding to the exact revision the
 * author read, and the generation gates that refuse `/generate`, `/chapters/:n/regenerate` and `/chapters/:n/generate-unrestricted`
 * before any model is reached. Every project fail-pins and quota-pins every role, since approving always stages a model job.
 */

function draftsPath(projectId: string, chapter: number, suffix = ''): string {
  return `/api/v1/projects/${projectId}/drafts/${chapter}${suffix}`;
}

async function setReviewStatus(projectId: string, chapter: number, reviewStatus: string): Promise<void> {
  await novelForgeDb()`UPDATE drafts SET review_status = ${reviewStatus}::draft_review_status WHERE project_id = ${projectId} AND chapter = ${chapter}`;
}

/** Approving always stages a finalize-review model job, so every call is guarded right before it, like {@link approveAsRead}. */
async function approveTolerant(ctx: APIRequestContext, projectId: string, chapter: number, data: Record<string, unknown>): Promise<APIResponse> {
  await assertSpendGuarded(projectId);
  const response = await mutate(ctx, 'post', draftsPath(projectId, chapter, '/approve'), { data });
  await expectCommittedDespiteSerializerBug(response, 200, `approving chapter ${chapter}`);
  return response;
}

test.describe('novel-forge hand saves, imports and the stale cascade', () => {
  test('should refuse malformed or out-of-turn saves and keep the final lock, and leave an unchanged save untouched', async ({ forge }) => {
    const owner = await forge.actor({ label: 'draft-guards' });
    const projectId = await createGuardedProject(forge, owner, 'draft-guards');

    await expectCode(
      await mutate(owner.ctx, 'put', draftsPath(projectId, 1), { data: { baseDraftId: '1', body: 'partial base' } }),
      400,
      'DRF_020',
      'a save with only baseDraftId set',
    );
    await expectCode(
      await mutate(owner.ctx, 'put', draftsPath(projectId, 1), { data: { baseDraftId: '999999999999', baseRevision: 1, baseSaveSeq: 1, body: 'no draft yet' } }),
      404,
      'DRF_001',
      'a based save against a chapter with no draft',
    );

    const started = await startNextChapter(owner.ctx, projectId);
    const written = await saveChapter(owner.ctx, projectId, started, CHAPTER_ONE);
    const unchanged = await saveChapter(owner.ctx, projectId, written, CHAPTER_ONE);
    expect(unchanged, 'a save identical to the current text is a no-op').toMatchObject({ revision: written.revision, saveSeq: written.saveSeq });

    await insertFinalDraft(projectId, 99);
    await expectCode(await mutate(owner.ctx, 'put', draftsPath(projectId, 99), { data: { body: 'past the lock' } }), 400, 'DRF_002', 'saving a final draft');
    await expectCode(await mutate(owner.ctx, 'delete', draftsPath(projectId, 99)), 400, 'DRF_002', 'deleting a final draft');
    await expectCode(await mutate(owner.ctx, 'delete', draftsPath(projectId, 50)), 404, 'DRF_001', 'deleting a chapter with no draft');
  });

  test('should fold consecutive unreviewed hand saves and break the fold on a review, an approval or an import', async ({ forge }) => {
    const owner = await forge.actor({ label: 'draft-fold' });
    const projectId = await createGuardedProject(forge, owner, 'draft-fold');

    const a = await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    const b = await saveChapter(owner.ctx, projectId, a, { ...CHAPTER_ONE, body: `${CHAPTER_ONE.body}\n\nA second unreviewed line.` });
    expect(b, 'two consecutive unreviewed saves fold into one revision').toMatchObject({ revision: a.revision, saveSeq: a.saveSeq + 1 });

    const reviewed = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/reviews`, { data: { kind: 'mechanics' } });
    expect(reviewed.status(), await reviewed.text()).toBe(201);
    const c = await saveChapter(owner.ctx, projectId, b, { ...CHAPTER_ONE, body: `${b.body}\n\nA third line, after a review.` });
    expect(c.revision, 'a save after a review on the current revision does not fold').toBeGreaterThan(b.revision);

    const approved = await approveAsRead(owner.ctx, projectId, c);
    const d = await saveChapter(owner.ctx, projectId, approved, { ...CHAPTER_ONE, body: `${approved.body}\n\nA fourth line, after approval.` });
    expect(d.revision, 'a save after approval does not fold').toBeGreaterThan(approved.revision);

    const imported = await importDraft(owner.ctx, projectId, d, { body: `${d.body}\n\nPasted prose replaces the hand-written text.`, title: 'Imported' });
    expect(imported.revision, 'an import always bumps the revision, even where a hand edit would have folded').toBeGreaterThan(d.revision);
    expect(imported.generator).toBe('human');
    expect(imported.isolated, 'isolated is kept (false) when the import omits it').toBe(false);
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });

  // b3425e3b — generation.controller.ts:213-218: two @RespondFor, no @HttpStatus → fastify-router.ts:322-327 defaults the POST to 201 with no bigint transformer, so import commits but answers 500 S001.
  test.fixme('should answer an import with the imported draft', async ({ forge }) => {
    const owner = await forge.actor({ label: 'draft-import-response' });
    const projectId = await createGuardedProject(forge, owner, 'draft-import-response');
    const empty = await startNextChapter(owner.ctx, projectId);

    const response = await mutate(owner.ctx, 'post', draftsPath(projectId, 1, '/import'), {
      data: { baseDraftId: empty.id, baseRevision: empty.revision, baseSaveSeq: empty.saveSeq, prose: 'Imported prose.', title: 'Imported' },
    });
    expect(response.status(), await response.text()).toBe(200);
    expect(await response.json()).toMatchObject({ body: 'Imported prose.', title: 'Imported', generator: 'human' });
  });

  test('should mark later approved and contradicted drafts stale on an ancestor edit, and never mark a final chapter', async ({ forge }) => {
    const owner = await forge.actor({ label: 'draft-stale' });
    const projectId = await createGuardedProject(forge, owner, 'draft-stale');

    const ch1 = await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    const ch2 = await writeChapterByHand(owner.ctx, projectId, { title: 'Two', body: 'Chapter two prose, first cut.' });
    await approveAsRead(owner.ctx, projectId, ch2);
    await writeChapterByHand(owner.ctx, projectId, { title: 'Three', body: 'Chapter three prose, first cut.' });
    await setReviewStatus(projectId, 3, 'contradiction');
    await insertFinalDraft(projectId, 4);

    await saveChapter(owner.ctx, projectId, ch1, { ...CHAPTER_ONE, body: `${CHAPTER_ONE.body}\n\nAn edit to chapter one.` });

    const two = await readStaleDraft(owner.ctx, projectId, 2);
    expect(two, 'an approved descendant is marked stale and its approval revoked').toMatchObject({ reviewStatus: 'needs_review' });
    expect(two.staleReason).toBe('ancestor chapter 1 was hand_edited');

    const three = await readStaleDraft(owner.ctx, projectId, 3);
    expect(three, 'a contradicted descendant is marked stale but keeps its review status').toMatchObject({ reviewStatus: 'contradiction' });
    expect(three.staleReason).toBe('ancestor chapter 1 was hand_edited');

    const four = await readStaleDraft(owner.ctx, projectId, 4);
    expect(four, 'a final chapter is never marked stale').toMatchObject({ status: 'final', staleReason: null });

    const summary = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/summary`)).json()) as { items: DraftSummaryItem[] };
    expect(summary.items.map(item => item.chapter)).toEqual([1, 2, 3, 4]);
    expect(
      summary.items.every(item => item.body === undefined),
      'the summary never carries prose',
    ).toBe(true);
    const stale = Object.fromEntries(summary.items.map(item => [item.chapter, item.stale]));
    expect(stale).toMatchObject({ 1: false, 2: true, 3: true, 4: false });

    const before = summary.items.find(item => item.chapter === 1)?.writtenAt;
    await novelForgeDb()`UPDATE drafts SET updated_at = now() WHERE project_id = ${projectId} AND chapter = 1`;
    const after = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/summary`)).json()) as { items: DraftSummaryItem[] };
    expect(after.items.find(item => item.chapter === 1)?.writtenAt, 'writtenAt tracks the latest revision row, not updatedAt').toBe(before);
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });

  test('should leave a hole on delete, cascade the chapter’s continuity proposal, reviews, finalize review and images, and mark later drafts stale', async ({ forge }) => {
    const owner = await forge.actor({ label: 'draft-delete' });
    const projectId = await createGuardedProject(forge, owner, 'draft-delete');

    const ch1 = await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    const reviewed = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/reviews`, { data: { kind: 'mechanics' } });
    expect(reviewed.status(), await reviewed.text()).toBe(201);
    await insertContinuityProposal(projectId, 1);
    await approveAsRead(owner.ctx, projectId, ch1);
    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const image = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/images`, { data: { mime: 'image/png', image: tinyPng, caption: 'a scene' } });
    expect(image.status(), await image.text()).toBe(201);
    const imageUrl = ((await image.json()) as { imageUrl: string }).imageUrl;

    const ch2 = await writeChapterByHand(owner.ctx, projectId, { title: 'Two', body: 'Chapter two prose.' });
    const image2 = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/2/images`, { data: { mime: 'image/png', image: tinyPng } });
    expect(image2.status(), await image2.text()).toBe(201);
    await approveAsRead(owner.ctx, projectId, ch2);

    const [proposalBefore] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM continuity_proposals WHERE project_id = ${projectId} AND chapter = 1`;
    expect(proposalBefore?.count, 'the continuity proposal exists before the delete').toBe(1);
    const [reviewBefore] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM chapter_reviews WHERE project_id = ${projectId} AND chapter = 1`;
    expect(reviewBefore?.count, 'the mechanics review exists before the delete').toBe(1);
    expect(await readFinalizeReviewStatus(projectId, 1), 'the finalize review exists before the delete').toBeDefined();

    const deleted = await mutate(owner.ctx, 'delete', draftsPath(projectId, 1));
    expect(deleted.status(), await deleted.text()).toBe(204);

    await expectCode(await owner.ctx.get(draftsPath(projectId, 1)), 404, 'DRF_001', 'reading the deleted draft');
    await expectCode(await mutate(owner.ctx, 'delete', draftsPath(projectId, 1)), 404, 'DRF_001', 'deleting it twice');

    const [proposalRow] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM continuity_proposals WHERE project_id = ${projectId} AND chapter = 1`;
    expect(proposalRow?.count, 'the deleted chapter’s continuity proposal went with it').toBe(0);
    const [reviewRow] = await novelForgeDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM chapter_reviews WHERE project_id = ${projectId} AND chapter = 1`;
    expect(reviewRow?.count, 'and its reviews').toBe(0);
    expect(await readFinalizeReviewStatus(projectId, 1), 'and its finalize review').toBeUndefined();
    const images1 = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/chapters/1/images`)).json()) as { items: unknown[] };
    expect(images1.items, 'and its scene images').toEqual([]);

    const images2 = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/chapters/2/images`)).json()) as { items: { imageUrl: string }[] };
    expect(images2.items, 'chapter 2’s image (same bytes, a shared content-addressed ref) is untouched').toHaveLength(1);
    expect(images2.items[0]?.imageUrl).toBe(imageUrl);
    const stillServed = await owner.ctx.get(imageUrl);
    expect(stillServed.status(), 'the content-addressed storage object survives the delete').toBe(200);

    const two = await readStaleDraft(owner.ctx, projectId, 2);
    expect(two, 'the later chapter is marked stale by the deletion').toMatchObject({ reviewStatus: 'needs_review' });
    expect(two.staleReason).toBe('ancestor chapter 1 was deleted');

    const hole = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/summary`)).json()) as { items: DraftSummaryItem[] };
    expect(
      hole.items.map(item => item.chapter),
      'chapter 1 stays a hole — chapter 2 keeps its own number',
    ).toEqual([2]);
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });
});

test.describe('novel-forge approval binding', () => {
  test('should approve exactly once per idempotency key, refuse a mismatched or stale approval, and approve-as-written only the reason it read', async ({ forge }) => {
    const owner = await forge.actor({ label: 'draft-approve' });
    const projectId = await createGuardedProject(forge, owner, 'draft-approve');

    const ch1 = await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    await writeChapterByHand(owner.ctx, projectId, { title: 'Two', body: 'Chapter two prose.' });

    const key = `e2e-idem-1-${uniqueSuffix()}`;
    await approveTolerant(owner.ctx, projectId, 1, { revision: ch1.revision, saveSeq: ch1.saveSeq, draftId: ch1.id, idempotencyKey: key });
    await approveTolerant(owner.ctx, projectId, 1, { revision: ch1.revision, saveSeq: ch1.saveSeq, draftId: ch1.id, idempotencyKey: key });
    expect(await countApprovals(projectId, 1), 'a retried idempotency key never duplicates the approval row').toBe(1);
    await approveTolerant(owner.ctx, projectId, 1, { revision: ch1.revision, saveSeq: ch1.saveSeq, draftId: ch1.id, idempotencyKey: `e2e-idem-2-${uniqueSuffix()}` });
    expect(await countApprovals(projectId, 1), 'a distinct key records a distinct approval').toBe(2);

    await expectCode(
      await mutate(owner.ctx, 'post', draftsPath(projectId, 1, '/approve'), { data: { revision: ch1.revision + 5, saveSeq: ch1.saveSeq, draftId: ch1.id } }),
      409,
      'DRF_013',
      'approving against a revision the author did not read',
    );

    await novelForgeDb()`UPDATE drafts SET stale_reason = 'e2e forced stale' WHERE project_id = ${projectId} AND chapter = 1`;
    const stale = await readStaleDraft(owner.ctx, projectId, 1);
    await expectCode(
      await mutate(owner.ctx, 'post', draftsPath(projectId, 1, '/approve'), { data: { revision: stale.revision, saveSeq: stale.saveSeq, draftId: stale.id } }),
      400,
      'DRF_007',
      'approving a stale draft without keepStale',
    );
    await expectCode(
      await mutate(owner.ctx, 'post', draftsPath(projectId, 1, '/approve'), {
        data: { revision: stale.revision, saveSeq: stale.saveSeq, draftId: stale.id, keepStale: true, staleReason: 'not what is actually stored' },
      }),
      409,
      'DRF_013',
      'approving as written with a stale reason that does not match what is stored',
    );

    await approveTolerant(owner.ctx, projectId, 1, {
      revision: stale.revision,
      saveSeq: stale.saveSeq,
      draftId: stale.id,
      keepStale: true,
      staleReason: 'e2e forced stale',
    });
    const lifted = await readStaleDraft(owner.ctx, projectId, 1);
    expect(lifted, 'approving as written commits, even where the response body was lost to S001').toMatchObject({ reviewStatus: 'approved', staleReason: null });

    const [feedbackRow] = await novelForgeDb()<{ note: string | null }[]>`
      SELECT note FROM user_feedback WHERE project_id = ${projectId} AND artifact_type = 'draft' AND artifact_ref = '1' AND disposition = 'approved' ORDER BY id DESC LIMIT 1
    `;
    expect(feedbackRow?.note, 'the override is recorded').toBe('approved as written over: e2e forced stale');

    const twoAfter = await readStaleDraft(owner.ctx, projectId, 2);
    expect(twoAfter.staleReason, 'approving chapter 1 as written never marks a later draft stale').toBeNull();

    await assertSpendGuarded(projectId);
    expect(await readFinalizeReviewStatus(projectId, 1), 'approving always stages a finalize review').toBeDefined();
    const [reviewJob] = await novelForgeDb()<{ id: string }[]>`SELECT id::text FROM jobs WHERE project_id = ${projectId} AND kind = 'finalize_review' ORDER BY id DESC LIMIT 1`;
    expect(reviewJob, 'approving enqueues a finalize_review job').toBeDefined();
    const settledReview = await pollJobStatus(reviewJob!.id);
    expect(settledReview.status, 'the finalize_review job fails under the fail-pin').toBe('failed');
    const [attempts] = await novelForgeDb()<{ attempts: number }[]>`SELECT attempts FROM jobs WHERE id = ${reviewJob!.id}`;
    expect(attempts?.attempts, 'finalize_review is never retried').toBe(1);
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });
});

test.describe('novel-forge generation gates without a model', () => {
  test('should refuse generate with no briefs, any contradicted draft, or a stale brief in the batch', async ({ forge }) => {
    const owner = await forge.actor({ label: 'gen-guards' });
    const projectId = await createGuardedProject(forge, owner, 'gen-guards');

    await assertSpendGuarded(projectId);
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/generate`, { data: {} }), 400, 'BRF_001', 'generating with no briefs at all');

    await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    await setReviewStatus(projectId, 1, 'contradiction');
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/generate`, { data: {} }), 400, 'DRF_003', 'generating while a draft sits in contradiction');
    await setReviewStatus(projectId, 1, 'needs_review');

    const staleProjectId = await createGuardedProject(forge, owner, 'gen-stale-brief');
    await writeBrief(owner.ctx, staleProjectId, 1, { body: 'A plain chapter with nothing hand-approved yet.' });
    await novelForgeDb()`UPDATE briefs SET stale_reason = 'e2e stale brief' WHERE project_id = ${staleProjectId} AND chapter = 1`;
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${staleProjectId}/generate`, { data: {} }), 400, 'BRF_002', 'generating a batch whose brief is stale');
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
    expect(await listDispatchedModelCalls(staleProjectId), 'no real model call was made').toEqual([]);
  });

  test('should refuse generate before an earlier chapter is drafted', async ({ forge }) => {
    const owner = await forge.actor({ label: 'gen-undrafted' });
    const projectId = await createGuardedProject(forge, owner, 'gen-undrafted');
    await writeBrief(owner.ctx, projectId, 3, { body: 'A brief far ahead of anything written.' });

    await assertSpendGuarded(projectId);
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/generate`, { data: {} }), 400, 'DRF_011', 'generating with an earlier chapter still undrafted');
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });

  test('should refuse generate while an earlier chapter’s lesson is unsettled', async ({ forge }) => {
    const owner = await forge.actor({ label: 'gen-teacher' });
    const projectId = await createGuardedProject(forge, owner, 'gen-teacher');
    await writeBrief(owner.ctx, projectId, 1, {
      body: 'Mira learns the truth.',
      knowledgeContract: { pov: ['mira'], learns: [{ entityKey: 'mira', factKey: 'e2e_secret' }] },
    });
    await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    await writeBrief(owner.ctx, projectId, 2, { body: 'A plain follow-on chapter.' });

    await assertSpendGuarded(projectId);
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/generate`, { data: {} }), 400, 'DRF_016', 'generating while an earlier lesson is unsettled');
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });

  test('should enqueue a generate job, dedupe a second request onto it, and cancel it with no model call', async ({ forge }) => {
    const owner = await forge.actor({ label: 'gen-allowed' });
    const projectId = await createGuardedProject(forge, owner, 'gen-allowed');
    await writeBrief(owner.ctx, projectId, 1, { body: 'A plain chapter with no lessons to settle.' });

    await assertSpendGuarded(projectId);
    const first = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/generate`, { data: {} });
    expect(first.status(), await first.text()).toBe(202);
    const firstJob = (await first.json()) as JobEnqueueResponse;

    const second = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/generate`, { data: {} });
    expect(second.status(), await second.text()).toBe(202);
    const secondJob = (await second.json()) as JobEnqueueResponse;
    expect(secondJob.jobId, 'a second request while one is active returns the same job').toBe(firstJob.jobId);

    const cancelled = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/jobs/${firstJob.jobId}/cancel`);
    expect(cancelled.status(), await cancelled.text()).toBe(200);
    const cancelledBody = (await cancelled.json()) as { outcome: string };
    expect(['cancelled', 'stopping', 'already_settled']).toContain(cancelledBody.outcome);

    const settled = await pollJobStatus(firstJob.jobId);
    expect(['cancelled', 'failed', 'done'], 'the job reached a terminal state').toContain(settled.status);
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });

  test('should refuse generate-unrestricted on a final draft without reaching a model', async ({ forge }) => {
    const owner = await forge.actor({ label: 'gen-unrestricted-final' });
    const projectId = await createGuardedProject(forge, owner, 'gen-unrestricted-final');
    await insertFinalDraft(projectId, 1);

    await assertSpendGuarded(projectId);
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/generate-unrestricted`, { data: {} }),
      400,
      'DRF_002',
      'generating unrestricted over a final draft',
    );
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });

  test('should refuse regenerate with no brief, a stale one, or a locked chapter', async ({ forge }) => {
    const owner = await forge.actor({ label: 'regen-brief-lock' });
    const projectId = await createGuardedProject(forge, owner, 'regen-brief-lock');

    await assertSpendGuarded(projectId);
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/regenerate`), 400, 'BRF_001', 'regenerating a chapter with no brief');

    await writeBrief(owner.ctx, projectId, 1, { body: 'A plain chapter.' });
    await novelForgeDb()`UPDATE briefs SET stale_reason = 'e2e stale' WHERE project_id = ${projectId} AND chapter = 1`;
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/regenerate`), 400, 'BRF_002', 'regenerating a chapter whose brief is stale');

    const lockedProjectId = await createGuardedProject(forge, owner, 'regen-locked');
    await writeBrief(owner.ctx, lockedProjectId, 1, { body: 'A plain chapter.' });
    await insertFinalDraft(lockedProjectId, 1);
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${lockedProjectId}/chapters/1/regenerate`), 409, 'CHP_008', 'regenerating a locked, finalized chapter');
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
    expect(await listDispatchedModelCalls(lockedProjectId), 'no real model call was made').toEqual([]);
  });

  test('should refuse regenerate while another generation job is active, but allow a chapter to regenerate its own contradiction', async ({ forge }) => {
    const owner = await forge.actor({ label: 'regen-active-job' });
    const projectId = await createGuardedProject(forge, owner, 'regen-active-job');
    await writeBrief(owner.ctx, projectId, 1, { body: 'Chapter one, plain.' });
    await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    await writeBrief(owner.ctx, projectId, 2, { body: 'Chapter two, plain.' });

    await assertSpendGuarded(projectId);
    const queued = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/generate`, { data: {} });
    expect(queued.status(), await queued.text()).toBe(202);
    const job = (await queued.json()) as JobEnqueueResponse;
    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/regenerate`), 409, 'DRF_010', 'regenerating while another generation job runs');
    await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/jobs/${job.jobId}/cancel`);
    const settledFirst = await pollJobStatus(job.jobId);
    expect(['cancelled', 'failed', 'done'], 'the active job reached a terminal state').toContain(settledFirst.status);

    await setReviewStatus(projectId, 1, 'contradiction');
    const own = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/regenerate`);
    expect(own.status(), `regenerating a chapter's own contradiction is allowed — body ${await own.text()}`).toBe(202);
    const ownJob = (await own.json()) as JobEnqueueResponse;
    await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/jobs/${ownJob.jobId}/cancel`);
    const settledOwn = await pollJobStatus(ownJob.jobId);
    expect(['cancelled', 'failed', 'done'], 'the own-contradiction job reached a terminal state').toContain(settledOwn.status);
    await setReviewStatus(projectId, 1, 'needs_review');

    await writeChapterByHand(owner.ctx, projectId, { title: 'Two', body: 'Chapter two prose.' });
    await setReviewStatus(projectId, 2, 'contradiction');
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/regenerate`),
      400,
      'DRF_003',
      'regenerating chapter 1 while a different chapter is contradicted',
    );

    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });

  test('should refuse regenerate behind an unfilled external brief, or before an earlier chapter is written, or over an unsettled lesson', async ({ forge }) => {
    const external = await forge.actor({ label: 'regen-external' });
    const externalProjectId = await createGuardedProject(forge, external, 'regen-external');
    await writeBrief(external.ctx, externalProjectId, 1, { body: 'An external-write slot nobody filled.' });
    await novelForgeDb()`UPDATE briefs SET write_mode = 'external' WHERE project_id = ${externalProjectId} AND chapter = 1`;
    await writeBrief(external.ctx, externalProjectId, 3, { body: 'The target chapter.' });
    await assertSpendGuarded(externalProjectId);
    await expectCode(
      await mutate(external.ctx, 'post', `/api/v1/projects/${externalProjectId}/chapters/3/regenerate`),
      400,
      'DRF_012',
      'regenerating behind an unfilled external brief',
    );

    const gap = await forge.actor({ label: 'regen-gap' });
    const gapProjectId = await createGuardedProject(forge, gap, 'regen-gap');
    await writeBrief(gap.ctx, gapProjectId, 1, { body: 'Chapter one, unwritten.' });
    await writeBrief(gap.ctx, gapProjectId, 3, { body: 'The target chapter.' });
    await expectCode(
      await mutate(gap.ctx, 'post', `/api/v1/projects/${gapProjectId}/chapters/3/regenerate`),
      400,
      'DRF_011',
      'regenerating a chapter before an earlier one is drafted',
    );

    const teacher = await forge.actor({ label: 'regen-teacher' });
    const teacherProjectId = await createGuardedProject(forge, teacher, 'regen-teacher');
    await writeBrief(teacher.ctx, teacherProjectId, 1, {
      body: 'Mira learns the truth.',
      knowledgeContract: { pov: ['mira'], learns: [{ entityKey: 'mira', factKey: 'e2e_secret' }] },
    });
    await writeChapterByHand(teacher.ctx, teacherProjectId, CHAPTER_ONE);
    await writeChapterByHand(teacher.ctx, teacherProjectId, { title: 'Two', body: 'Chapter two prose.' });
    await writeBrief(teacher.ctx, teacherProjectId, 3, { body: 'The target chapter.' });
    await expectCode(await mutate(teacher.ctx, 'post', `/api/v1/projects/${teacherProjectId}/chapters/3/regenerate`), 400, 'DRF_016', 'regenerating over an unsettled lesson');

    expect(await listDispatchedModelCalls(externalProjectId), 'no real model call was made').toEqual([]);
    expect(await listDispatchedModelCalls(gapProjectId), 'no real model call was made').toEqual([]);
    expect(await listDispatchedModelCalls(teacherProjectId), 'no real model call was made').toEqual([]);
  });

  test('should refuse regenerate while another operation holds the project’s authoring claim', async ({ forge }) => {
    const owner = await forge.actor({ label: 'regen-claim' });
    const projectId = await createGuardedProject(forge, owner, 'regen-claim');
    await writeBrief(owner.ctx, projectId, 1, { body: 'A plain chapter.' });
    await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);
    await setReviewStatus(projectId, 1, 'contradiction');

    await assertSpendGuarded(projectId);
    await holdAuthoringClaim(projectId, { kind: 'generate' });
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/regenerate`),
      409,
      'JOB_002',
      'regenerating while another operation holds the authoring claim',
    );

    await releaseAuthoringClaim(projectId);
    const allowed = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/regenerate`);
    expect(allowed.status(), `regenerating once the claim is released — body ${await allowed.text()}`).toBe(202);
    const allowedJob = (await allowed.json()) as JobEnqueueResponse;
    const cancelledAllowed = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/jobs/${allowedJob.jobId}/cancel`);
    expect(cancelledAllowed.status(), await cancelledAllowed.text()).toBe(200);
    const settledAllowed = await pollJobStatus(allowedJob.jobId);
    expect(['cancelled', 'failed', 'done'], 'the job reached a terminal state').toContain(settledAllowed.status);
    expect(await listDispatchedModelCalls(projectId), 'no real model call was made').toEqual([]);
  });
});

test.describe('novel-forge chapter and entity images', () => {
  const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  interface ChapterImageItem {
    readonly id: string;
    readonly imageUrl: string;
    readonly caption?: string | null;
    readonly sortOrder: number;
  }

  interface EntityImageItem {
    readonly id: string;
    readonly imageUrl: string;
    readonly caption?: string | null;
    readonly sortOrder: number;
    readonly depictsChapter?: number | null;
  }

  interface EntityWithImages {
    readonly imageUrl?: string | null;
    readonly imageDepictsChapter?: number | null;
    readonly images?: EntityImageItem[];
  }

  test('should add chapter scene images in sort order and refuse deleting an unknown one', async ({ forge }) => {
    const owner = await forge.actor({ label: 'img-chapter' });
    const projectId = await createGuardedProject(forge, owner, 'img-chapter');
    await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE);

    const first = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/images`, { data: { mime: 'image/png', image: TINY_PNG, caption: 'first' } });
    expect(first.status(), await first.text()).toBe(201);
    const firstBody = (await first.json()) as ChapterImageItem;
    expect(firstBody).toMatchObject({ caption: 'first', sortOrder: 0 });
    expect(firstBody.imageUrl).toMatch(/^https?:\/\//);

    const second = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/images`, { data: { mime: 'image/png', image: TINY_PNG, caption: 'second' } });
    expect(second.status(), await second.text()).toBe(201);
    const secondBody = (await second.json()) as ChapterImageItem;
    expect(secondBody.sortOrder, 'sortOrder is monotonic per chapter').toBe(1);

    const listed = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/chapters/1/images`)).json()) as { items: ChapterImageItem[] };
    expect(listed.items.map(item => [item.id, item.sortOrder])).toEqual([
      [firstBody.id, 0],
      [secondBody.id, 1],
    ]);

    const deleted = await mutate(owner.ctx, 'delete', `/api/v1/projects/${projectId}/chapters/1/images/${firstBody.id}`);
    expect(deleted.status(), await deleted.text()).toBe(204);
    const afterDelete = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/chapters/1/images`)).json()) as { items: ChapterImageItem[] };
    expect(afterDelete.items.map(item => item.id)).toEqual([secondBody.id]);

    await expectCode(await mutate(owner.ctx, 'delete', `/api/v1/projects/${projectId}/chapters/1/images/999999999`), 404, 'DRF_006', 'deleting an unknown chapter image');
  });

  test('should carry an entity portrait and gallery, refuse an unknown gallery image, and 404 a missing entity', async ({ forge }) => {
    const owner = await forge.actor({ label: 'img-entity' });
    const projectId = await createGuardedProject(forge, owner, 'img-entity');
    await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities`, { data: { entityKey: 'mira', name: 'Mira', type: 'character' } });

    const bare = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/entities/mira`)).json()) as EntityWithImages;
    expect(bare.imageUrl ?? null, 'a portrait-less entity has no imageUrl').toBeNull();

    const portrait = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities/mira/image`, { data: { mime: 'image/png', image: TINY_PNG } });
    expect(portrait.status(), await portrait.text()).toBe(200);
    const portraitBody = (await portrait.json()) as EntityWithImages;
    expect(portraitBody.imageUrl).toMatch(/^https?:\/\//);
    expect(portraitBody.imageDepictsChapter, 'omitted depictsChapter defaults to the latest final chapter — none here, so 0').toBe(0);

    await insertFinalDraft(projectId, 1);
    const redated = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities/mira/image`, { data: { mime: 'image/png', image: TINY_PNG } });
    expect(redated.status(), await redated.text()).toBe(200);
    expect((await redated.json()) as EntityWithImages, 'once chapter 1 is final, an undated portrait defaults to it').toMatchObject({ imageDepictsChapter: 1 });

    const first = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities/mira/images`, { data: { mime: 'image/png', image: TINY_PNG, caption: 'first' } });
    expect(first.status(), await first.text()).toBe(201);
    const second = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities/mira/images`, {
      data: { mime: 'image/png', image: TINY_PNG, caption: 'second', depictsChapter: 5 },
    });
    expect(second.status(), await second.text()).toBe(201);
    const secondBody = (await second.json()) as EntityWithImages;
    const gallery = secondBody.images ?? [];
    expect(
      gallery.map(item => item.caption),
      'gallery images append in stable order',
    ).toEqual(['first', 'second']);
    const secondImage = gallery[1];
    expect(secondImage, 'a future depictsChapter is accepted — it stays withheld from readers until published').toMatchObject({ depictsChapter: 5 });

    const firstImageId = gallery[0]!.id;
    const deleted = await mutate(owner.ctx, 'delete', `/api/v1/projects/${projectId}/entities/mira/images/${firstImageId}`);
    expect(deleted.status(), await deleted.text()).toBe(200);
    const afterDelete = (await deleted.json()) as EntityWithImages;
    expect(
      (afterDelete.images ?? []).map(item => item.caption),
      'delete by id',
    ).toEqual(['second']);

    await expectCode(await mutate(owner.ctx, 'delete', `/api/v1/projects/${projectId}/entities/mira/images/999999999`), 404, 'ENT_002', 'deleting an unknown gallery image');
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities/no_such_entity/image`, { data: { mime: 'image/png', image: TINY_PNG } }),
      404,
      'ENT_001',
      'uploading a portrait to a missing entity',
    );
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities/no_such_entity/images`, { data: { mime: 'image/png', image: TINY_PNG } }),
      404,
      'ENT_001',
      'adding a gallery image to a missing entity',
    );
  });
});
