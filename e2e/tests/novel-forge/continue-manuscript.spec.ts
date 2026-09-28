/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { pollUntil, requireProductUrl } from '../../lib';
import { buildBundle, expect, FINAL_BUNDLE, test } from './forge-bundles';
import { CHAPTER_ONE, saveChapter, startNextChapter, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface ProjectJob {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
}

/**
 * Declaring the constants
 *
 * Continuing a manuscript, AI-free: the author imports the chapters already written as a `final` bundle, and the novel carries on from
 * the chapter after them. The upload goes through the Import screen; the job and the frontier are read from the API.
 */

const IMPORTED_CHAPTERS = 3;

async function importSettled(ctx: APIRequestContext, projectId: string): Promise<void> {
  const job = await pollUntil(
    async () => {
      const response = await ctx.get(`/api/v1/projects/${projectId}/jobs`);
      expect(response.status(), await response.text()).toBe(200);
      return ((await response.json()) as { items: ProjectJob[] }).items.find(item => item.kind === 'import');
    },
    current => current?.status === 'done' || current?.status === 'failed',
    { timeoutMs: 60_000, intervalMs: 500 },
  );
  expect(job?.status, `the import of project ${projectId} settled`).toBe('done');
}

test.describe('novel-forge continue a manuscript', () => {
  test('should import the chapters already written and carry on from the next one', async ({ forge, lane, browser }) => {
    const owner = await forge.actor({ label: 'continue-manuscript' });
    const title = `E2E Manuscript ${uniqueSuffix()}`;
    const context = await browser.newContext({ storageState: await owner.ctx.storageState(), ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();
      await page.goto(`${requireProductUrl('novelForge')}/import`);
      await expect(page.getByRole('heading', { name: 'Import novel', level: 1 })).toBeVisible({ timeout: 15_000 });

      await page.locator('input[type="file"]').setInputFiles({
        name: 'manuscript.novel.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(buildBundle({ ...FINAL_BUNDLE, title }))),
      });
      await expect(page.getByText(title)).toBeVisible();
      await page.getByRole('button', { name: 'Import novel' }).click();

      await expect(page).toHaveURL(/\/novels\/\d+\/overview/, { timeout: 20_000 });
      const projectId = /\/novels\/(\d+)\//.exec(page.url())?.[1] ?? '';
      lane.track(projectId);
      await importSettled(owner.ctx, projectId);
      await lane.guard(projectId);

      const project = (await (await owner.ctx.get(`/api/v1/projects/${projectId}`)).json()) as { kind: string; title: string };
      expect(project).toMatchObject({ kind: 'new_novel', title });

      const next = await startNextChapter(owner.ctx, projectId);
      expect(next.chapter).toBe(IMPORTED_CHAPTERS + 1);
      await saveChapter(owner.ctx, projectId, next, CHAPTER_ONE);

      await page.goto(`${requireProductUrl('novelForge')}/novels/${projectId}/chapters`);
      await expect(page.getByRole('heading', { name: 'Chapters', level: 1 })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: `Open chapter ${IMPORTED_CHAPTERS + 1}: ${CHAPTER_ONE.title}` })).toBeVisible();
      await expect(page.getByRole('button', { name: `Write chapter ${IMPORTED_CHAPTERS + 2} myself` })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
