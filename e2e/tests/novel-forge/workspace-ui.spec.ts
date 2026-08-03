/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, pollJob, requireProductUrl, storageStateFor } from '../../lib';
import { buildFinalBundle, createProject, deleteProjectQuietly, jsonOrUndefined, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Workspace odds-and-ends that do not need AI: the export endpoint's two outcomes (bytes for a project with
 * chapters, EXP_001 for an empty one), and the authenticated web surface — overview CTA, the settings General
 * tab persisting a brief, and the Models tab's role rows. The Models test also RECORDS which Haiku id the
 * dropdown would submit, documenting (never "fixing") the dated-id-vs-gateway mismatch from novel-forge.md §0.
 */

test.describe('novel-forge export endpoint (API)', () => {
  let ctx: APIRequestContext;
  let importedProjectId: string;
  let emptyProjectId: string;

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');

    const importRes = await mutate(ctx, 'post', '/api/v1/import', { data: { bundle: buildFinalBundle(`E2E Export ${uniqueSuffix()}`) } });
    const { projectId, jobId } = (await importRes.json()) as { projectId: string; jobId: string };
    importedProjectId = projectId;
    await pollJob(ctx, jobId, { timeoutMs: 60_000 });

    const empty = await createProject(ctx, { name: `e2e-forge-empty-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });
    emptyProjectId = empty.id;
  });

  test.afterAll(async () => {
    await deleteProjectQuietly(ctx, importedProjectId);
    await deleteProjectQuietly(ctx, emptyProjectId);
    await ctx.dispose();
  });

  test('should export a .novel package with bytes for a project that has chapters', async () => {
    const response = await ctx.get(`/api/v1/projects/${importedProjectId}/export/novel`);
    expect(response.status(), await response.text()).toBe(200);
    expect((await response.body()).length).toBeGreaterThan(0);
  });

  test('should refuse to export an empty project with EXP_001', async () => {
    const response = await ctx.get(`/api/v1/projects/${emptyProjectId}/export/novel`);
    expect(response.status()).toBe(400);
    expect((await jsonOrUndefined<{ code: string }>(response))?.code).toBe('EXP_001');
  });
});

test.describe('novel-forge workspace UI', () => {
  test.use({ storageState: storageStateFor('user1') });

  let ctx: APIRequestContext;
  let projectId: string;

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
    const { id } = await createProject(ctx, { name: `e2e-forge-ui-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard', title: 'UI Novel' });
    projectId = id;
    await mutate(ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { brief: 'A seed brief so the overview CTA reflects a ready-to-plan state.' } });
  });

  test.afterAll(async () => {
    await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
  });

  test('should render the overview with a state-derived CTA', async ({ page }) => {
    const base = requireProductUrl('novelForge');
    await page.goto(`${base}/novels/${projectId}/overview`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main')).toBeVisible();
    // The lifecycle stepper's primary CTA is always an arrow-suffixed action ("Open story bible →", etc.).
    await expect(
      page
        .getByRole('link', { name: /→/ })
        .or(page.getByRole('button', { name: /→/ }))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('should persist a brief edited on the settings General tab', async ({ page }) => {
    const base = requireProductUrl('novelForge');
    const nextBrief = `Edited via the settings General tab ${uniqueSuffix()}.`;
    await page.goto(`${base}/novels/${projectId}/settings`, { waitUntil: 'networkidle' });

    // The brief textarea is pre-filled from the project, and a plain fill() appends rather than replaces on
    // this controlled field — clear it with the keyboard first, then type the new value.
    const field = page.getByLabel('Premise / brief');
    await field.click();
    await field.press('ControlOrMeta+A');
    await field.press('Delete');
    await field.fill(nextBrief);
    await page.getByRole('button', { name: 'Save changes' }).first().click();

    // Assert persistence at the source of truth rather than scraping a toast.
    await expect(async () => {
      const fetched = await ctx.get(`/api/v1/projects/${projectId}`);
      expect((await fetched.json()).brief).toBe(nextBrief);
    }).toPass({ timeout: 15_000 });
  });

  test('should render Models-tab role rows and record the Haiku id the dropdown submits', async ({ page }) => {
    const base = requireProductUrl('novelForge');
    await page.goto(`${base}/novels/${projectId}/settings`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Models' }).click();

    // The role rows are custom @shadow-library/ui Selects (role=combobox, aria-label "Model"), one per model
    // group. Assert they render, then open the first and confirm the Anthropic group lists a Haiku option.
    const modelCombos = page.getByRole('combobox', { name: 'Model' });
    await expect(modelCombos.first()).toBeVisible({ timeout: 15_000 });
    expect(await modelCombos.count()).toBeGreaterThanOrEqual(5);

    await modelCombos.first().click();
    await expect(page.getByRole('option', { name: /haiku/i }).first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');

    // RECORD (do not "fix") the id the dropdown actually submits. The Select is built from GET /ai/models, whose
    // Anthropic Haiku entry carries the DATED id — the exact one the dev AI gateway rejects (novel-forge.md §0),
    // while the API model-pin uses the undated `claude-haiku-4-5`. Surfacing the mismatch is the point.
    const registry = (await (await ctx.get('/api/v1/ai/models')).json()) as { models: { id: string; provider: string }[] };
    const haiku = registry.models.filter(m => m.provider === 'anthropic' && /haiku/i.test(m.id)).map(m => m.id);
    console.log('[novel-forge Models tab] Anthropic Haiku id(s) the dropdown submits:', haiku);
    expect(haiku.length, 'the /ai/models registry backing the dropdown should list an Anthropic Haiku model').toBeGreaterThan(0);
  });
});
