/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, requireProductUrl, storageStateFor } from '../../lib';
import { assertSpendGuarded, failPin, listDispatchedModelCalls } from './forge-db';
import {
  approveChapter,
  CHAPTER_ONE,
  CHAPTER_TWO,
  type CreatedNovel,
  createNovel,
  deleteProjectQuietly,
  type Draft,
  errorCode,
  expectCommittedDespiteSerializerBug,
  readDraft,
  readFinalizeReview,
  saveChapter,
  startNextChapter,
  uniqueSuffix,
} from './forge-helpers';

/**
 * Defining types
 */

interface ChapterReview {
  kind: string;
  disposition: string;
  draftRevision?: number | null;
  stale: boolean;
}

/**
 * Declaring the constants
 *
 * The hand-writing path, AI-free: a chapter is started in order, written and saved against the revision the author read, checked by
 * the deterministic reviews, and approved. An approval queues the finalize-review read, a model call, so every project here is
 * fail-pinned — a seeded persona cannot be quota-pinned — and the read fails AI_002 before any dispatch.
 */

test.describe('novel-forge hand-written chapters (API)', () => {
  test.describe.configure({ mode: 'serial' });

  let ctx: APIRequestContext;
  let projectId = '';
  let draft: Draft;

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
    projectId = (await createNovel(ctx, { title: `E2E Hand-written ${uniqueSuffix()}` })).projectId;
    await failPin(projectId);
  });

  test.afterAll(async () => {
    const dispatched = projectId ? await listDispatchedModelCalls(projectId) : [];
    await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
    expect(dispatched, 'no request of this suite reached a model').toEqual([]);
  });

  test('should start chapter 1 first and refuse to start a chapter out of order (DRF_018)', async () => {
    draft = await startNextChapter(ctx, projectId);
    expect(draft).toMatchObject({ chapter: 1, status: 'draft' });

    const skipped = await mutate(ctx, 'put', `/api/v1/projects/${projectId}/drafts/5`, { data: { body: 'A chapter written ahead of its turn.' } });
    expect(skipped.status(), await skipped.text()).toBe(400);
    expect(await errorCode(skipped)).toBe('DRF_018');
  });

  test('should save the hand-written text and refuse a save against a base it moved past (DRF_013)', async () => {
    const stale = draft;
    draft = await saveChapter(ctx, projectId, draft, CHAPTER_ONE);
    expect(draft.body).toBe(CHAPTER_ONE.body);
    expect(draft.title).toBe(CHAPTER_ONE.title);
    expect(draft.generator).toBe('human');

    const conflict = await mutate(ctx, 'put', `/api/v1/projects/${projectId}/drafts/1`, {
      data: { baseDraftId: stale.id, baseRevision: stale.revision, baseSaveSeq: stale.saveSeq, body: 'A save from a tab that never saw the last one.' },
    });
    expect(conflict.status(), await conflict.text()).toBe(409);
    expect(await errorCode(conflict)).toBe('DRF_013');
    expect((await readDraft(ctx, projectId, 1)).body).toBe(CHAPTER_ONE.body);
  });

  test('should report that an unapproved chapter cannot be finalized yet (DRF_004)', async () => {
    const readiness = (await (await ctx.get(`/api/v1/projects/${projectId}/drafts/1/finalize-readiness`)).json()) as { ready: boolean; blockers: { code: string }[] };
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map(blocker => blocker.code)).toContain('DRF_004');
  });

  test('should run the mechanics and readability checks against the current revision without a model', async () => {
    for (const kind of ['mechanics', 'readability']) {
      const run = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/reviews`, { data: { kind } });
      expect(run.status(), await run.text()).toBe(201);
      const review = (await run.json()) as ChapterReview;
      expect(review).toMatchObject({ kind, draftRevision: draft.revision, stale: false });
      expect(['clear', 'issues', 'blocking']).toContain(review.disposition);
    }

    const listed = (await (await ctx.get(`/api/v1/projects/${projectId}/chapters/1/reviews`)).json()) as { latest: ChapterReview[] };
    expect(listed.latest.map(review => review.kind)).toEqual(expect.arrayContaining(['mechanics', 'readability']));
  });

  test('should refuse an approval of text the author did not read (DRF_013)', async () => {
    await assertSpendGuarded(projectId);
    const refused = await approveChapter(ctx, projectId, { ...draft, saveSeq: draft.saveSeq + 1 });
    expect(refused.status(), await refused.text()).toBe(409);
    expect(await errorCode(refused)).toBe('DRF_013');
  });

  test('should approve the revision read and stage a finalize review bound to it', async () => {
    await assertSpendGuarded(projectId);
    await expectCommittedDespiteSerializerBug(await approveChapter(ctx, projectId, draft), 200, 'approving chapter 1');
    draft = await readDraft(ctx, projectId, 1);
    expect(draft).toMatchObject({ reviewStatus: 'approved', approvedRevision: draft.revision });

    const review = await readFinalizeReview(ctx, projectId, 1);
    expect(review.status(), await review.text()).toBe(200);
    const body = (await review.json()) as { draftRevision: number; current: boolean; status: string };
    expect(body).toMatchObject({ draftRevision: draft.revision, current: true });
    expect(['preparing', 'ready', 'failed']).toContain(body.status);
  });

  test('should mark the approval and its review out of date once the text changes', async () => {
    const approvedRevision = draft.revision;
    draft = await saveChapter(ctx, projectId, draft, { ...CHAPTER_ONE, body: `${CHAPTER_ONE.body}\n\nThe lamplighter did not come back the next day.` });
    expect(draft.revision).toBeGreaterThan(approvedRevision);
    expect(draft.approvedRevision).toBe(approvedRevision);
    expect(draft.reviewStatus).not.toBe('approved');

    const review = (await (await readFinalizeReview(ctx, projectId, 1)).json()) as { current: boolean };
    expect(review.current).toBe(false);
  });

  test('should open the next chapter at 2 while chapter 1 is still a draft', async () => {
    const next = await startNextChapter(ctx, projectId);
    expect(next.chapter).toBe(2);
    expect((await saveChapter(ctx, projectId, next, CHAPTER_TWO)).body).toBe(CHAPTER_TWO.body);
  });
});

test.describe('novel-forge chat → write it myself → approve (UI)', () => {
  test.use({ storageState: storageStateFor('user1') });

  let ctx: APIRequestContext;
  let novel: CreatedNovel;

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
    novel = await createNovel(ctx, { title: `E2E Workspace ${uniqueSuffix()}` });
    await failPin(novel.projectId);
  });

  test.afterAll(async () => {
    const dispatched = novel ? await listDispatchedModelCalls(novel.projectId) : [];
    if (novel) await deleteProjectQuietly(ctx, novel.projectId);
    await ctx.dispose();
    expect(dispatched, 'no request of this suite reached a model').toEqual([]);
  });

  test('should write chapter 1 by hand from the chat, approve it and open its finalize review', async ({ page }) => {
    await page.goto(`${requireProductUrl('novelForge')}/novels/${novel.projectId}/chat?session=${novel.sessionId}`);

    const planYourWay = page.getByRole('group', { name: 'Or plan it your way' });
    await expect(async () => {
      await page.getByRole('group', { name: 'Suggested prompts' }).getByRole('button', { name: 'Plan chapter 1' }).click();
      await expect(planYourWay).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await planYourWay.getByRole('button', { name: /^Write it myself/ }).click();
    await page.getByRole('region', { name: 'Write chapter 1 yourself' }).getByRole('button', { name: 'Open the editor' }).click();
    await expect(page).toHaveURL(/\/chapters\?chapter=1\b/, { timeout: 20_000 });

    await page.getByRole('textbox', { name: 'Chapter title' }).fill(CHAPTER_ONE.title ?? '');
    await page.getByRole('textbox', { name: 'Chapter prose (Markdown)' }).fill(CHAPTER_ONE.body);
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    await expect.poll(async () => (await readDraft(ctx, novel.projectId, 1)).body, { timeout: 15_000 }).toBe(CHAPTER_ONE.body);

    await assertSpendGuarded(novel.projectId);
    const approval = page.waitForResponse(response => response.request().method() === 'POST' && /\/drafts\/1\/approve$/.test(new URL(response.url()).pathname));
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expectCommittedDespiteSerializerBug(await approval, 200, 'approving chapter 1 from the workspace');
    await expect.poll(async () => (await readDraft(ctx, novel.projectId, 1)).reviewStatus, { timeout: 15_000 }).toBe('approved');
    // The serializer bug's 500 (generation.controller.ts:180, fixme'd in facts.spec.ts) leaves the page on its stale draft; a 200 must refresh it unaided.
    if ((await approval).status() === 500) await page.reload();

    await page.getByRole('button', { name: 'Finalize · review Story Bible updates' }).click();
    const review = page.getByRole('dialog', { name: /^Finalize chapter 1/ });
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Back to the chapter' }).click();
    await expect(review).toBeHidden();

    await page.getByRole('button', { name: 'Back to chapters' }).click();
    await expect(page.getByRole('heading', { name: 'Chapters', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: `Open chapter 1: ${CHAPTER_ONE.title}` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Write chapter 2 myself' })).toBeVisible();
  });
});
