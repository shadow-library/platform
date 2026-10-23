import { mutate, requireProductUrl } from '../../lib';
import { expectCode } from './forge-arrange';
import { buildBundle, expect, readZip, test } from './forge-bundles';
import { readProjectRow, UNREGISTERED_MODEL } from './forge-db';
import { createNovel, errorCode } from './forge-helpers';

/** AI-free CRUD, settings and export, each on a project a fresh actor owns; assertions are contract-level (status and error codes, persisted shapes) rather than copy text. */

test.describe('novel-forge project CRUD and settings (API)', () => {
  test('should create a project, list it, and answer its status and cost endpoints', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'crud' });
    const id = await lane.project(owner, 'crud', { title: 'A Working Title' });
    expect(id).toMatch(/^[0-9]+$/);

    const list = await owner.ctx.get('/api/v1/projects?kind=new_novel');
    expect(list.status()).toBe(200);
    expect(((await list.json()) as { items: { id: string }[] }).items.map(p => p.id)).toContain(id);

    const status = await owner.ctx.get(`/api/v1/projects/${id}/status`);
    expect(status.status()).toBe(200);
    expect((await status.json()).kind).toBe('new_novel');

    expect((await owner.ctx.get(`/api/v1/projects/${id}/cost`)).status()).toBe(200);
  });

  test('should persist a patched title and brief', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'patch' });
    const id = await lane.project(owner, 'patch');

    const patch = await mutate(owner.ctx, 'patch', `/api/v1/projects/${id}`, { data: { title: 'Renamed Title', brief: 'A brief the planner reads.' } });
    expect(patch.status(), await patch.text()).toBe(200);

    const body = (await (await owner.ctx.get(`/api/v1/projects/${id}`)).json()) as { title: string; brief: string };
    expect(body.title).toBe('Renamed Title');
    expect(body.brief).toBe('A brief the planner reads.');
  });

  test('should drop a per-role model pin from a project update and store the rest', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'models-dropped' });
    const id = await lane.project(owner, 'models-dropped');
    const stored = (await readProjectRow(id))?.config;

    const patched = await mutate(owner.ctx, 'patch', `/api/v1/projects/${id}`, { data: { title: 'Stored', config: { models: { generation: UNREGISTERED_MODEL } } } });
    expect(patched.status(), await patched.text()).toBe(200);
    expect(((await patched.json()) as { title: string }).title).toBe('Stored');
    expect((await readProjectRow(id))?.config, 'the pin was never stored').toEqual(stored);
  });

  test('should clone a project to a new id and then delete the clone into a 404 PRJ_001', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'clone' });
    const originalId = await lane.project(owner, 'clone-src');

    const clone = await mutate(owner.ctx, 'post', `/api/v1/projects/${originalId}/clone`, { data: { name: `e2e-forge-clone-dst-${Date.now().toString(36)}` } });
    expect(clone.status(), await clone.text()).toBe(201);
    const cloneId = ((await clone.json()) as { id: string }).id;
    lane.track(cloneId);
    expect(cloneId).toMatch(/^[0-9]+$/);
    expect(cloneId).not.toBe(originalId);

    expect((await mutate(owner.ctx, 'delete', `/api/v1/projects/${cloneId}`)).status()).toBe(204);
    const gone = await owner.ctx.get(`/api/v1/projects/${cloneId}`);
    expect(gone.status()).toBe(404);
    expect(await errorCode(gone)).toBe('PRJ_001');
  });
});

test.describe('novel-forge export endpoint (API)', () => {
  test('should export a .novel package with bytes for a project that has chapters', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'export' });
    const { projectId } = await lane.imported(owner, buildBundle({ title: `E2E Export ${Date.now().toString(36)}` }));

    const response = await owner.ctx.get(`/api/v1/projects/${projectId}/export/novel`);
    expect(response.status(), await response.text()).toBe(200);
    expect([...readZip(await response.body()).keys()]).toEqual(expect.arrayContaining(['manifest.json', 'chapters/0001.md']));
  });

  test('should refuse to export an empty project with EXP_001', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'export-empty' });
    const projectId = await lane.project(owner, 'export-empty');
    await expectCode(await owner.ctx.get(`/api/v1/projects/${projectId}/export/novel`), 400, 'EXP_001', 'a project with nothing written');
  });
});

test.describe('novel-forge project settings (UI)', () => {
  test('should persist a brief edited on the settings General tab', async ({ forge, lane, browser }) => {
    const owner = await forge.actor({ label: 'settings-ui' });
    const { projectId } = await createNovel(owner.ctx, { title: `E2E Settings ${Date.now().toString(36)}` });
    await lane.guard(projectId);
    await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { brief: 'A seed brief the settings form starts from.' } });

    const context = await browser.newContext({ storageState: await owner.ctx.storageState(), ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();
      const nextBrief = `Edited via the settings General tab ${Date.now().toString(36)}.`;
      await page.goto(`${requireProductUrl('novelForge')}/novels/${projectId}/settings`);

      // `fill()` appends on this controlled field, so clear it with the keyboard first. The workspace holds a live connection, so the page never reaches `networkidle`; the
      // pre-filled value marks it ready.
      const field = page.getByLabel('Premise / brief');
      await expect(field).toHaveValue(/seed brief/);
      await field.click();
      await field.press('ControlOrMeta+A');
      await field.press('Delete');
      await field.fill(nextBrief);
      await page.getByRole('button', { name: 'Save changes' }).click();

      await expect(async () => {
        expect((await (await owner.ctx.get(`/api/v1/projects/${projectId}`)).json()).brief).toBe(nextBrief);
      }).toPass({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });
});
