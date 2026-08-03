/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, requireProductUrl, storageStateFor } from '../../lib';
import { createProject, HAIKU_MODEL, haikuModelConfig, jsonOrUndefined, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Project CRUD + settings, driven API-first as user1: create → list → status/cost → patch title/brief →
 * patch the Haiku model pin → clone → delete → 404. Assertions are contract-level (status codes, the
 * PRJ_001 error code, the persisted `config.models` shape) rather than copy-text. A single UI test then
 * proves the dashboard card renders and the "Start a new novel" modal creates a project whose workspace
 * overview loads with its lifecycle stepper.
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
    const name = `e2e-forge-crud-${uniqueSuffix()}`;
    const { id, response } = await createProject(ctx, { name, kind: 'new_novel', contentMode: 'standard', title: 'A Working Title' });
    expect(response.status(), await response.text()).toBe(201);
    expect(id).toMatch(/^[0-9]+$/);

    const list = await ctx.get('/api/v1/projects?kind=new_novel');
    expect(list.status()).toBe(200);
    const listBody = (await list.json()) as { items: { id: string }[] };
    expect(listBody.items.map(p => p.id)).toContain(id);

    const status = await ctx.get(`/api/v1/projects/${id}/status`);
    expect(status.status()).toBe(200);
    expect((await status.json()).kind).toBe('new_novel');

    const cost = await ctx.get(`/api/v1/projects/${id}/cost`);
    expect(cost.status()).toBe(200);

    await mutate(ctx, 'delete', `/api/v1/projects/${id}`);
  });

  test('should persist a patched title and brief', async () => {
    const { id } = await createProject(ctx, { name: `e2e-forge-patch-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });

    const patch = await mutate(ctx, 'patch', `/api/v1/projects/${id}`, { data: { title: 'Renamed Title', brief: 'A brief the premise tooling reads.' } });
    expect(patch.status(), await patch.text()).toBe(200);

    const fetched = await ctx.get(`/api/v1/projects/${id}`);
    const body = (await fetched.json()) as { title: string; brief: string };
    expect(body.title).toBe('Renamed Title');
    expect(body.brief).toBe('A brief the premise tooling reads.');

    await mutate(ctx, 'delete', `/api/v1/projects/${id}`);
  });

  test('should persist the Haiku model pin and echo it from config.models', async () => {
    const { id } = await createProject(ctx, { name: `e2e-forge-models-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });

    const patch = await mutate(ctx, 'patch', `/api/v1/projects/${id}`, { data: { config: haikuModelConfig() } });
    expect(patch.status(), await patch.text()).toBe(200);

    const fetched = await ctx.get(`/api/v1/projects/${id}`);
    const body = (await fetched.json()) as { config?: { models?: Record<string, { provider: string; model: string }> } };
    // The pin persisted across every text role, and it is the undated id (the only one the dev gateway accepts).
    expect(body.config?.models?.generation).toEqual(HAIKU_MODEL);
    expect(body.config?.models?.judge).toEqual(HAIKU_MODEL);
    expect(body.config?.models?.chat).toEqual(HAIKU_MODEL);

    await mutate(ctx, 'delete', `/api/v1/projects/${id}`);
  });

  test('should clone a project to a new id and then delete the clone into a 404 PRJ_001', async () => {
    const { id: originalId } = await createProject(ctx, { name: `e2e-forge-clone-src-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });

    const clone = await mutate(ctx, 'post', `/api/v1/projects/${originalId}/clone`, { data: { name: `e2e-forge-clone-dst-${uniqueSuffix()}` } });
    expect(clone.status(), await clone.text()).toBe(201);
    const cloneBody = (await clone.json()) as { id: string };
    expect(cloneBody.id).toMatch(/^[0-9]+$/);
    expect(cloneBody.id).not.toBe(originalId);

    const del = await mutate(ctx, 'delete', `/api/v1/projects/${cloneBody.id}`);
    expect(del.status()).toBe(204);

    const gone = await ctx.get(`/api/v1/projects/${cloneBody.id}`);
    expect(gone.status()).toBe(404);
    expect((await jsonOrUndefined<{ code: string }>(gone))?.code).toBe('PRJ_001');

    await mutate(ctx, 'delete', `/api/v1/projects/${originalId}`);
  });
});

test.describe('novel-forge dashboard and new-novel modal (UI)', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should create a project from the modal and land on the workspace overview', async ({ page }) => {
    const base = requireProductUrl('novelForge');
    const workingTitle = `E2E Modal Novel ${uniqueSuffix()}`;

    await page.goto(`${base}/`, { waitUntil: 'networkidle' });

    // The dashboard's primary action opens the "Start a new novel" modal (novel-forge.md §1). The modal only
    // wires up once the client has hydrated, so open it via a poll on its "Working title" field rather than a
    // single click — the header button can register a pre-hydration click that no-ops.
    const workingTitleField = page.getByLabel('Working title');
    await expect(async () => {
      await page.getByRole('button', { name: 'New project', exact: true }).first().click();
      await expect(workingTitleField).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await workingTitleField.fill(workingTitle);
    // Content mode defaults to "Standard" in the modal's SegmentedControl, so it is left untouched.
    await page.getByRole('button', { name: 'Create novel' }).click();

    // A successful create routes to /novels/:id/overview, whose lifecycle stepper renders the primary CTA.
    await expect(page).toHaveURL(/\/novels\/\d+\/overview/, { timeout: 20_000 });
    await expect(page.getByRole('main')).toBeVisible();
  });
});
