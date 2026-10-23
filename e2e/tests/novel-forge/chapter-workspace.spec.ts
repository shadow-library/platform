import { mutate, requireProductUrl } from '../../lib';
import { expect, type ForgeActor, type ForgeHarness, test } from './forge-actors';
import { assertSpendGuarded, listDispatchedModelCalls } from './forge-db';
import {
  approveChapter,
  CHAPTER_ONE,
  CHAPTER_TWO,
  type CreatedNovel,
  createNovel,
  type Draft,
  errorCode,
  expectStatus,
  readDraft,
  readFinalizeReview,
  saveChapter,
  startNextChapter,
  uniqueSuffix,
} from './forge-helpers';

interface ChapterReview {
  kind: string;
  disposition: string;
  draftRevision?: number | null;
  stale: boolean;
}

/**
 * The AI-free hand-writing path: a chapter is started in order, saved against the revision the author read, checked by deterministic reviews, and approved. Approval queues a
 * model call (the finalize-review read), so every novel belongs to a quota-pinned owner the test created and the read fails AI_008 before dispatch.
 */

async function guardedNovel(forge: ForgeHarness, owner: ForgeActor, title: string): Promise<CreatedNovel> {
  const novel = await createNovel(owner.ctx, { title: `${title} ${uniqueSuffix()}` });
  await forge.quotaPin(novel.projectId);
  return novel;
}

test.describe('novel-forge hand-written chapters (API)', () => {
  test('should write, check and approve chapters by hand without reaching a model', async ({ forge }) => {
    const owner = await forge.actor({ label: 'hand-written' });
    const ctx = owner.ctx;
    const { projectId } = await guardedNovel(forge, owner, 'E2E Hand-written');
    let draft: Draft = await startNextChapter(ctx, projectId);

    await test.step('start chapter 1 first and refuse to start a chapter out of order (DRF_018)', async () => {
      expect(draft).toMatchObject({ chapter: 1, status: 'draft' });

      const skipped = await mutate(ctx, 'put', `/api/v1/projects/${projectId}/drafts/5`, { data: { body: 'A chapter written ahead of its turn.' } });
      expect(skipped.status(), await skipped.text()).toBe(400);
      expect(await errorCode(skipped)).toBe('DRF_018');
    });

    await test.step('save the hand-written text and refuse a save against a base it moved past (DRF_013)', async () => {
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

    await test.step('report that an unapproved chapter cannot be finalized yet (DRF_004)', async () => {
      const readiness = (await (await ctx.get(`/api/v1/projects/${projectId}/drafts/1/finalize-readiness`)).json()) as { ready: boolean; blockers: { code: string }[] };
      expect(readiness.ready).toBe(false);
      expect(readiness.blockers.map(blocker => blocker.code)).toContain('DRF_004');
    });

    await test.step('run the mechanics and readability checks against the current revision without a model', async () => {
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

    await test.step('refuse an approval of text the author did not read (DRF_013)', async () => {
      await assertSpendGuarded(projectId);
      const refused = await approveChapter(ctx, projectId, { ...draft, saveSeq: draft.saveSeq + 1 });
      expect(refused.status(), await refused.text()).toBe(409);
      expect(await errorCode(refused)).toBe('DRF_013');
    });

    await test.step('approve the revision read and stage a finalize review bound to it', async () => {
      await assertSpendGuarded(projectId);
      await expectStatus(await approveChapter(ctx, projectId, draft), 200, 'approving chapter 1');
      draft = await readDraft(ctx, projectId, 1);
      expect(draft).toMatchObject({ reviewStatus: 'approved', approvedRevision: draft.revision });

      const review = await readFinalizeReview(ctx, projectId, 1);
      expect(review.status(), await review.text()).toBe(200);
      const body = (await review.json()) as { draftRevision: number; current: boolean; status: string };
      expect(body).toMatchObject({ draftRevision: draft.revision, current: true });
      expect(['preparing', 'ready', 'failed']).toContain(body.status);
    });

    await test.step('mark the approval and its review out of date once the text changes', async () => {
      const approvedRevision = draft.revision;
      draft = await saveChapter(ctx, projectId, draft, { ...CHAPTER_ONE, body: `${CHAPTER_ONE.body}\n\nThe lamplighter did not come back the next day.` });
      expect(draft.revision).toBeGreaterThan(approvedRevision);
      expect(draft.approvedRevision).toBe(approvedRevision);
      expect(draft.reviewStatus).not.toBe('approved');

      const review = (await (await readFinalizeReview(ctx, projectId, 1)).json()) as { current: boolean };
      expect(review.current).toBe(false);
    });

    await test.step('open the next chapter at 2 while chapter 1 is still a draft', async () => {
      const next = await startNextChapter(ctx, projectId);
      expect(next.chapter).toBe(2);
      expect((await saveChapter(ctx, projectId, next, CHAPTER_TWO)).body).toBe(CHAPTER_TWO.body);
    });

    expect(await listDispatchedModelCalls(projectId), 'no request of this test reached a model').toEqual([]);
  });
});

test.describe('novel-forge chat → write it myself → approve (UI)', () => {
  test('should write chapter 1 by hand from the chat, approve it and open its finalize review', async ({ forge, browser }) => {
    const owner = await forge.actor({ label: 'workspace-ui' });
    const ctx = owner.ctx;
    const novel = await guardedNovel(forge, owner, 'E2E Workspace');
    const context = await browser.newContext({ storageState: await ctx.storageState(), ignoreHTTPSErrors: true });
    const page = await context.newPage();
    try {
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
      await expectStatus(await approval, 200, 'approving chapter 1 from the workspace');
      await expect.poll(async () => (await readDraft(ctx, novel.projectId, 1)).reviewStatus, { timeout: 15_000 }).toBe('approved');

      await page.getByRole('button', { name: 'Finalize · review Story Bible updates' }).click();
      const review = page.getByRole('dialog', { name: /^Finalize chapter 1/ });
      await expect(review).toBeVisible();
      await review.getByRole('button', { name: 'Back to the chapter' }).click();
      await expect(review).toBeHidden();

      await page.getByRole('button', { name: 'Back to chapters' }).click();
      await expect(page.getByRole('heading', { name: 'Chapters', level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: `Open chapter 1: ${CHAPTER_ONE.title}` })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Write chapter 2 myself' })).toBeVisible();
      expect(await listDispatchedModelCalls(novel.projectId), 'no request of this test reached a model').toEqual([]);
    } finally {
      await context.close();
    }
  });
});
