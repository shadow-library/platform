/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, pollUntil, requireProductUrl, storageStateFor } from '../../lib';
import { buildFinalBundle, CHAPTER_ONE, deleteProjectQuietly, saveChapter, startNextChapter, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface ProjectJob {
  kind: string;
  status: string;
}

/**
 * Declaring the constants
 *
 * Continuing a manuscript, AI-free: the author imports the chapters already written as a `final` bundle, and the novel carries on from
 * the chapter after them. The upload goes through the Import screen; the frontier is read from the API.
 */

const IMPORTED_CHAPTERS = 3;

async function importSettled(ctx: APIRequestContext, projectId: string): Promise<void> {
  const jobs = await pollUntil(
    async () => ((await (await ctx.get(`/api/v1/projects/${projectId}/jobs`)).json()) as { items: ProjectJob[] }).items,
    items => items.some(job => job.kind === 'import') && items.every(job => !['pending', 'in_progress'].includes(job.status)),
    { timeoutMs: 60_000, intervalMs: 1_000 },
  );
  expect(jobs.find(job => job.kind === 'import')?.status).toBe('done');
}

test.describe('novel-forge continue a manuscript', () => {
  test.use({ storageState: storageStateFor('user1') });

  let ctx: APIRequestContext;
  let projectId = '';

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
  });

  test.afterAll(async () => {
    if (projectId) await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
  });

  test('should import the chapters already written and carry on from the next one', async ({ page }) => {
    const title = `E2E Manuscript ${uniqueSuffix()}`;
    await page.goto(`${requireProductUrl('novelForge')}/import`);
    await expect(page.getByRole('heading', { name: 'Import novel', level: 1 })).toBeVisible({ timeout: 15_000 });

    await page.locator('input[type="file"]').setInputFiles({
      name: 'manuscript.novel.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(buildFinalBundle(title))),
    });
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole('button', { name: 'Import novel' }).click();

    await expect(page).toHaveURL(/\/novels\/\d+\/overview/, { timeout: 20_000 });
    projectId = /\/novels\/(\d+)\//.exec(page.url())?.[1] ?? '';
    await importSettled(ctx, projectId);

    const project = (await (await ctx.get(`/api/v1/projects/${projectId}`)).json()) as { kind: string; title: string };
    expect(project).toMatchObject({ kind: 'new_novel', title });

    const next = await startNextChapter(ctx, projectId);
    expect(next.chapter).toBe(IMPORTED_CHAPTERS + 1);
    await saveChapter(ctx, projectId, next, CHAPTER_ONE);

    await page.goto(`${requireProductUrl('novelForge')}/novels/${projectId}/chapters`);
    await expect(page.getByRole('heading', { name: 'Chapters', level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: `Open chapter ${IMPORTED_CHAPTERS + 1}: ${CHAPTER_ONE.title}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Write chapter ${IMPORTED_CHAPTERS + 2} myself` })).toBeVisible();
  });
});
