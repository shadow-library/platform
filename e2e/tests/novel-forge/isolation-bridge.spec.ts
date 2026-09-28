/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, requireProductUrl, storageStateFor } from '../../lib';
import { type ForgeActor, type ForgeHarness, test as forgeTest } from './forge-actors';
import { assertSpendGuarded, failPin, listDispatchedModelCalls } from './forge-db';
import {
  aiAvailable,
  aiSkipReason,
  approveChapter,
  CHAPTER_ONE,
  CHAPTER_TWO,
  createNovel,
  deleteProjectQuietly,
  errorCode,
  finalizeThroughReview,
  MODEL_FLOW_TIMEOUT_MS,
  MODEL_TAG,
  pasteChapter,
  pinHaiku,
  readDraft,
  uniqueSuffix,
  writeChapterByHand,
} from './forge-helpers';

/**
 * Defining types
 */

interface Bridge {
  chapter: number;
  revision: number;
  approved: boolean;
  summary?: string | null;
  positions: unknown[];
}

/**
 * Declaring the constants
 *
 * An isolated (unrestricted) chapter's prose never reaches a standard call; later chapters read only the bridge the author approved
 * in its finalize review. The deterministic half proves the wall is up before anything is approved; the model-backed half finalizes
 * the chapter through its review and reads the bridge that crossed.
 */

const ISOLATED_CHAPTER = { ...CHAPTER_ONE, title: 'Behind the Locked Door' };

/** A standard novel of `owner` whose owner stands at the call ceiling, which holds on the unrestricted route an isolated chapter takes. */
async function bridgedNovel(forge: ForgeHarness, owner: ForgeActor): Promise<string> {
  const { projectId } = await createNovel(owner.ctx, { title: `E2E Bridge ${uniqueSuffix()}` });
  await forge.quotaPin(projectId);
  await failPin(projectId);
  return projectId;
}

forgeTest.describe('novel-forge isolated chapter bridge', () => {
  forgeTest('should keep a pasted isolated chapter walled off until a bridge is approved', async ({ forge }) => {
    const owner = await forge.actor({ label: 'bridge-walled' });
    const projectId = await bridgedNovel(forge, owner);
    const isolated = await pasteChapter(owner.ctx, projectId, ISOLATED_CHAPTER, { isolated: true });
    expect(isolated).toMatchObject({ chapter: 1, isolated: true, generator: 'human' });

    const bridge = await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/1/bridge`);
    expect(bridge.status(), await bridge.text()).toBe(200);
    expect((await bridge.json()) as Bridge).toMatchObject({ chapter: 1, revision: isolated.revision, approved: false, positions: [] });
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });

  forgeTest('should refuse to read a bridge before the chapter is final (BRG_002)', async ({ forge }) => {
    const owner = await forge.actor({ label: 'bridge-unfinished' });
    const projectId = await bridgedNovel(forge, owner);
    await pasteChapter(owner.ctx, projectId, ISOLATED_CHAPTER, { isolated: true });

    await assertSpendGuarded(projectId, { requireQuota: true });
    const prepare = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/drafts/1/bridge/prepare`);
    expect(prepare.status(), await prepare.text()).toBe(400);
    expect(await errorCode(prepare)).toBe('BRG_002');
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });

  forgeTest('should answer that a standard chapter has no bridge (BRG_001)', async ({ forge }) => {
    const owner = await forge.actor({ label: 'bridge-standard' });
    const projectId = await bridgedNovel(forge, owner);
    await pasteChapter(owner.ctx, projectId, ISOLATED_CHAPTER, { isolated: true });
    const standard = await writeChapterByHand(owner.ctx, projectId, CHAPTER_TWO);
    expect(standard).toMatchObject({ chapter: 2, isolated: false });

    const bridge = await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/2/bridge`);
    expect(bridge.status()).toBe(400);
    expect(await errorCode(bridge)).toBe('BRG_001');
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });

  forgeTest('should mark the isolated chapter as unrestricted in the chapter list and its workspace', async ({ forge, browser }) => {
    const owner = await forge.actor({ label: 'bridge-ui' });
    const projectId = await bridgedNovel(forge, owner);
    await pasteChapter(owner.ctx, projectId, ISOLATED_CHAPTER, { isolated: true });
    await writeChapterByHand(owner.ctx, projectId, CHAPTER_TWO);

    const context = await browser.newContext({ storageState: await owner.ctx.storageState(), ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();
      await page.goto(`${requireProductUrl('novelForge')}/novels/${projectId}/chapters`);
      const row = page.getByRole('button', { name: `Open chapter 1: ${ISOLATED_CHAPTER.title}` });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row.getByText('unrestricted', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: `Open chapter 2: ${CHAPTER_TWO.title}` }).getByText('unrestricted', { exact: true })).toHaveCount(0);

      await row.click();
      await expect(page).toHaveURL(/chapter=1\b/);
      await expect(page.getByText('unrestricted', { exact: true }).first()).toBeVisible();
    } finally {
      await context.close();
    }
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });
});

test.describe('novel-forge isolated chapter bridge (model)', { tag: MODEL_TAG }, () => {
  test.use({ storageState: storageStateFor('user1') });
  test.describe.configure({ mode: 'serial' });

  let ctx: APIRequestContext;
  let projectId = '';
  let available = false;

  test.beforeAll(async () => {
    available = await aiAvailable('user1');
    ctx = await apiContext('novelForge', 'user1');
    if (!available) return;
    projectId = (await createNovel(ctx, { title: `E2E Bridge Model ${uniqueSuffix()}` })).projectId;
    await pinHaiku(ctx, projectId);
  });

  test.afterAll(async () => {
    if (projectId) await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
  });

  test.beforeEach(() => {
    test.skip(!available, aiSkipReason());
    test.setTimeout(MODEL_FLOW_TIMEOUT_MS);
  });

  test('should finalize an isolated chapter through its review and carry only the approved bridge', async () => {
    const isolated = await pasteChapter(ctx, projectId, ISOLATED_CHAPTER, { isolated: true });
    const approved = await approveChapter(ctx, projectId, isolated);
    expect(approved.status(), await approved.text()).toBe(200);

    const review = await finalizeThroughReview(ctx, projectId, 1);
    expect(review).toMatchObject({ isolated: true, status: 'applied' });
    expect((await readDraft(ctx, projectId, 1)).status).toBe('final');

    const bridge = (await (await ctx.get(`/api/v1/projects/${projectId}/drafts/1/bridge`)).json()) as Bridge;
    expect(bridge.approved, 'keeping the summary item approves the bridge against the final revision').toBe(true);
    expect(bridge.summary?.trim().length ?? 0).toBeGreaterThan(0);
    expect(bridge.summary ?? '').not.toContain(ISOLATED_CHAPTER.body);
  });

  test('should show what crosses in the final chapter’s Story Bible updates', async ({ page }) => {
    await page.goto(`${requireProductUrl('novelForge')}/novels/${projectId}/chapters?chapter=1`);
    await page.getByRole('button', { name: /^(Story Bible updates|Bridge)$/ }).click();
    const bridge = page.getByRole('dialog').getByRole('region', { name: 'Bridge to later chapters' });
    await expect(bridge).toBeVisible({ timeout: 15_000 });
    await expect(bridge.getByText('Standard chapters never read this chapter’s prose — only what you approved here.')).toBeVisible();
  });
});
