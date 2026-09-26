/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, pollJob, requireProductUrl, storageStateFor } from '../../lib';
import { buildFinalBundle, createNovel, createProject, deleteProjectQuietly, errorCode, HAIKU_MODEL, haikuModelConfig, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Project CRUD, settings and export, AI-free. Assertions are contract-level — status codes, error codes, persisted shapes — rather
 * than copy text.
 */

test.describe('novel-forge project CRUD and settings (API)', () => {
  let ctx: APIRequestContext;

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  test('should create a project, list it, and answer its status and cost endpoints', async () => {
    const { id, response } = await createProject(ctx, { name: `e2e-forge-crud-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard', title: 'A Working Title' });
    expect(response.status(), await response.text()).toBe(201);
    expect(id).toMatch(/^[0-9]+$/);

    const list = await ctx.get('/api/v1/projects?kind=new_novel');
    expect(list.status()).toBe(200);
    expect(((await list.json()) as { items: { id: string }[] }).items.map(p => p.id)).toContain(id);

    const status = await ctx.get(`/api/v1/projects/${id}/status`);
    expect(status.status()).toBe(200);
    expect((await status.json()).kind).toBe('new_novel');

    expect((await ctx.get(`/api/v1/projects/${id}/cost`)).status()).toBe(200);

    await deleteProjectQuietly(ctx, id);
  });

  test('should persist a patched title and brief', async () => {
    const { id } = await createProject(ctx, { name: `e2e-forge-patch-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });

    const patch = await mutate(ctx, 'patch', `/api/v1/projects/${id}`, { data: { title: 'Renamed Title', brief: 'A brief the planner reads.' } });
    expect(patch.status(), await patch.text()).toBe(200);

    const body = (await (await ctx.get(`/api/v1/projects/${id}`)).json()) as { title: string; brief: string };
    expect(body.title).toBe('Renamed Title');
    expect(body.brief).toBe('A brief the planner reads.');

    await deleteProjectQuietly(ctx, id);
  });

  test('should persist the Haiku model pin and echo it from config.models', async () => {
    const { id } = await createProject(ctx, { name: `e2e-forge-models-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });

    const patch = await mutate(ctx, 'patch', `/api/v1/projects/${id}`, { data: { config: haikuModelConfig() } });
    expect(patch.status(), await patch.text()).toBe(200);

    const body = (await (await ctx.get(`/api/v1/projects/${id}`)).json()) as { config?: { models?: Record<string, { provider: string; model: string }> } };
    expect(body.config?.models?.generation).toEqual(HAIKU_MODEL);
    expect(body.config?.models?.continuity).toEqual(HAIKU_MODEL);
    expect(body.config?.models?.chat).toEqual(HAIKU_MODEL);

    await deleteProjectQuietly(ctx, id);
  });

  test('should clone a project to a new id and then delete the clone into a 404 PRJ_001', async () => {
    const { id: originalId } = await createProject(ctx, { name: `e2e-forge-clone-src-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });

    const clone = await mutate(ctx, 'post', `/api/v1/projects/${originalId}/clone`, { data: { name: `e2e-forge-clone-dst-${uniqueSuffix()}` } });
    expect(clone.status(), await clone.text()).toBe(201);
    const cloneId = ((await clone.json()) as { id: string }).id;
    expect(cloneId).toMatch(/^[0-9]+$/);
    expect(cloneId).not.toBe(originalId);

    expect((await mutate(ctx, 'delete', `/api/v1/projects/${cloneId}`)).status()).toBe(204);
    const gone = await ctx.get(`/api/v1/projects/${cloneId}`);
    expect(gone.status()).toBe(404);
    expect(await errorCode(gone)).toBe('PRJ_001');

    await deleteProjectQuietly(ctx, originalId);
  });
});

test.describe('novel-forge export endpoint (API)', () => {
  let ctx: APIRequestContext;
  let importedProjectId = '';
  let emptyProjectId = '';

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
    const importRes = await mutate(ctx, 'post', '/api/v1/import', { data: { bundle: buildFinalBundle(`E2E Export ${uniqueSuffix()}`) } });
    const { projectId, jobId } = (await importRes.json()) as { projectId: string; jobId: string };
    importedProjectId = projectId;
    await pollJob(ctx, jobId, { timeoutMs: 60_000 });
    emptyProjectId = (await createProject(ctx, { name: `e2e-forge-empty-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' })).id;
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
    expect(await errorCode(response)).toBe('EXP_001');
  });
});

test.describe('novel-forge project settings (UI)', () => {
  test.use({ storageState: storageStateFor('user1') });

  let ctx: APIRequestContext;
  let projectId = '';

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
    projectId = (await createNovel(ctx, { title: `E2E Settings ${uniqueSuffix()}` })).projectId;
    await mutate(ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { brief: 'A seed brief the settings form starts from.' } });
  });

  test.afterAll(async () => {
    await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
  });

  test('should persist a brief edited on the settings General tab', async ({ page }) => {
    const nextBrief = `Edited via the settings General tab ${uniqueSuffix()}.`;
    await page.goto(`${requireProductUrl('novelForge')}/novels/${projectId}/settings`);

    // A plain fill() appends on this controlled field, so it is cleared with the keyboard first. The workspace keeps a live connection
    // open, so the page never reaches `networkidle`; the pre-filled value marks it ready instead.
    const field = page.getByLabel('Premise / brief');
    await expect(field).toHaveValue(/seed brief/);
    await field.click();
    await field.press('ControlOrMeta+A');
    await field.press('Delete');
    await field.fill(nextBrief);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(async () => {
      expect((await (await ctx.get(`/api/v1/projects/${projectId}`)).json()).brief).toBe(nextBrief);
    }).toPass({ timeout: 15_000 });
  });
});
