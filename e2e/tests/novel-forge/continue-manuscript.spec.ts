/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, novelForgeDb, requireProductUrl, storageStateFor } from '../../lib';
import { buildBundle, FINAL_BUNDLE } from './forge-bundles';
import { CHAPTER_ONE, deleteProjectQuietly, pollJobStatus, saveChapter, startNextChapter, uniqueSuffix } from './forge-helpers';

/**
 * Declaring the constants
 *
 * Continuing a manuscript, AI-free: the author imports the chapters already written as a `final` bundle, and the novel carries on from
 * the chapter after them. The upload goes through the Import screen; the frontier is read from the API.
 */

const IMPORTED_CHAPTERS = 3;

/** The project's job list answers 500 once it holds any job (the fixme in jobs.spec.ts), so the import job is read from the forge's own table. */
async function importSettled(projectId: string): Promise<void> {
  const [job] = await novelForgeDb()<{ id: string }[]>`SELECT id::text FROM jobs WHERE project_id = ${projectId} AND kind = 'import'`;
  expect(job, `the import of project ${projectId} enqueued a job`).toBeDefined();
  expect((await pollJobStatus(job?.id ?? '', 60_000)).status).toBe('done');
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

  // packages/ui/src/components/FileUpload/FileUpload.tsx:78-81 re-runs onValueChange on each new identity, and the Import route
  // (apps/novel-forge-web/src/routes/_app/import.tsx:95-98) passes a fresh one that sets state each render: React #185.
  test.fixme('should import the chapters already written and carry on from the next one', async ({ page }) => {
    const title = `E2E Manuscript ${uniqueSuffix()}`;
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
    projectId = /\/novels\/(\d+)\//.exec(page.url())?.[1] ?? '';
    await importSettled(projectId);

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
