/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expectCode } from './forge-arrange';
import { buildBundle, countBibleDocuments, countEntities, countProjectsOwnedBy, expect, readVolumeRows, solidPng, storageRef, test } from './forge-bundles';
import { createEntity, errorCode } from './forge-helpers';

/**
 * Defining types
 */

interface ProjectView {
  id: string;
  title?: string | null;
  instructions?: string | null;
  wordTarget?: { min: number; max: number };
  costTier: string;
  coverUrl?: string | null;
  coverImagePath?: unknown;
}

interface ProjectDetailView extends ProjectView {
  defaultInstructions: string;
  defaultCopyRemoved: boolean;
}

interface ProjectColumns {
  title: string | null;
  instructions: string | null;
  wordTargetMin: number | null;
  wordTargetMax: number | null;
  coverImagePath: string | null;
}

/**
 * Declaring the constants
 *
 * The project resource itself, AI-free: identity of a new project, the fields a PATCH trims or clears, the chapter-writing instructions stored
 * as additions to the built-in style, the word-count band, cloning, listing order, the cover, stage resets and the status counters. Every
 * stored value is read back from the forge's own table as well as through the API.
 */

const TARGET = { min: 1200, max: 2400 };

async function readColumns(projectId: string): Promise<ProjectColumns | undefined> {
  const [row] = await novelForgeDb()<ProjectColumns[]>`
    SELECT title, instructions, word_target_min AS "wordTargetMin", word_target_max AS "wordTargetMax", cover_image_path AS "coverImagePath" FROM projects WHERE id = ${projectId}
  `;
  return row;
}

test.describe('novel-forge projects API', () => {
  test('should give two projects of the same name their own ids and refuse a kind that is not new_novel', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'prj-twins' });
    const name = `e2e-forge-twin-${Date.now().toString(36)}`;
    const first = await lane.project(owner, 'twin', { name });
    const second = await lane.project(owner, 'twin', { name });
    expect(second).not.toBe(first);

    const refused = await mutate(owner.ctx, 'post', '/api/v1/projects', { data: { name, kind: 'translation' } });
    expect(refused.status(), await refused.text()).toBe(422);
    expect(await errorCode(refused)).toBe('VALIDATION_ERROR');
    const [row] = await novelForgeDb()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM projects WHERE owner_kind = ${owner.owner.kind}::owner_kind AND owner_id = ${owner.owner.id} AND name = ${name}
    `;
    expect(row?.count).toBe(2);
  });

  test('should trim a patched title and clear a blank one to null', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'prj-title' });
    const projectId = await lane.project(owner, 'title');

    const trimmed = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { title: '   The Salt Road   ' } });
    expect(trimmed.status(), await trimmed.text()).toBe(200);
    expect(((await trimmed.json()) as ProjectView).title).toBe('The Salt Road');
    expect((await readColumns(projectId))?.title).toBe('The Salt Road');

    const blank = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { title: '    ' } });
    expect(blank.status(), await blank.text()).toBe(200);
    expect(((await blank.json()) as ProjectView).title ?? null).toBeNull();
    expect((await readColumns(projectId))?.title).toBeNull();
  });

  test('should store chapter-writing instructions as additions to the built-in style', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'prj-instructions' });
    const projectId = await lane.project(owner, 'instructions');
    const read = async (): Promise<ProjectDetailView> => (await (await owner.ctx.get(`/api/v1/projects/${projectId}`)).json()) as ProjectDetailView;
    const patch = async (instructions: string | null): Promise<ProjectView> => {
      const response = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { instructions } });
      expect(response.status(), await response.text()).toBe(200);
      return (await response.json()) as ProjectView;
    };

    const fresh = await read();
    expect(fresh.instructions ?? null).toBeNull();
    expect(fresh.defaultInstructions.trim().length).toBeGreaterThan(0);
    expect(fresh.defaultCopyRemoved).toBe(false);

    const custom = 'Write in the second person, present tense.';
    expect((await patch(custom)).instructions).toBe(custom);
    expect((await read()).instructions).toBe(custom);

    expect((await patch('')).instructions ?? null).toBeNull();
    expect((await readColumns(projectId))?.instructions).toBeNull();

    const addition = 'Keep every chapter inside the lighthouse.';
    expect((await patch(`${fresh.defaultInstructions}\n\n${addition}`)).instructions).toBe(addition);
    expect((await readColumns(projectId))?.instructions).toBe(addition);

    await novelForgeDb()`UPDATE projects SET instructions = ${fresh.defaultInstructions} WHERE id = ${projectId}`;
    const copied = await read();
    expect(copied.instructions ?? null).toBeNull();
    expect(copied.defaultCopyRemoved).toBe(true);
    expect((await readColumns(projectId))?.instructions, 'reading a stored copy of the default never rewrites the row').toBe(fresh.defaultInstructions);
  });

  test('should round-trip, clear and bound the chapter word-count target', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'prj-words' });
    const unset = await lane.project(owner, 'words-unset');
    expect(((await (await owner.ctx.get(`/api/v1/projects/${unset}`)).json()) as ProjectView).wordTarget, 'an unset target is omitted').toBeUndefined();

    const projectId = await lane.project(owner, 'words', { wordTarget: TARGET });
    expect(((await (await owner.ctx.get(`/api/v1/projects/${projectId}`)).json()) as ProjectView).wordTarget).toEqual(TARGET);

    const moved = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { wordTarget: { min: 800, max: 1600 } } });
    expect(((await moved.json()) as ProjectView).wordTarget).toEqual({ min: 800, max: 1600 });
    expect(await readColumns(projectId)).toEqual(expect.objectContaining({ wordTargetMin: 800, wordTargetMax: 1600 }));

    const cleared = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { wordTarget: null } });
    expect(cleared.status(), await cleared.text()).toBe(200);
    expect(((await cleared.json()) as ProjectView).wordTarget).toBeUndefined();
    expect(await readColumns(projectId)).toEqual(expect.objectContaining({ wordTargetMin: null, wordTargetMax: null }));

    const before = await countProjectsOwnedBy(owner);
    const inverted = { name: 'e2e-forge-inverted', kind: 'new_novel', wordTarget: { min: 2000, max: 2000 } };
    await expectCode(await mutate(owner.ctx, 'post', '/api/v1/projects', { data: inverted }), 400, 'PRJ_010', 'a create whose max is not above its min');
    await expectCode(await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { wordTarget: { min: 3000, max: 1000 } } }), 400, 'PRJ_010', 'an inverted patch');
    await expectCode(
      await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { wordTarget: { min: 400, max: 1000 } } }),
      422,
      'VALIDATION_ERROR',
      'a min below the floor',
    );
    await expectCode(
      await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { wordTarget: { min: 1000, max: 6001 } } }),
      422,
      'VALIDATION_ERROR',
      'a max above the ceiling',
    );
    expect(await countProjectsOwnedBy(owner), 'a refused create writes no project').toBe(before);
    expect(await readColumns(projectId)).toEqual(expect.objectContaining({ wordTargetMin: null, wordTargetMax: null }));

    const restored = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { wordTarget: TARGET } });
    expect(((await restored.json()) as ProjectView).wordTarget).toEqual(TARGET);
  });

  test("should clone the source's word target, tier, instructions, bible, entities and volumes unless overridden", async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'prj-clone' });
    const instructions = 'Keep every chapter inside the lighthouse.';
    const { projectId: source } = await lane.imported(owner, buildBundle({ title: `E2E Clone Source ${Date.now().toString(36)}`, instructions }));
    const configured = await mutate(owner.ctx, 'patch', `/api/v1/projects/${source}`, { data: { wordTarget: TARGET, costTier: 'economy' } });
    expect(configured.status(), await configured.text()).toBe(200);
    await createEntity(owner.ctx, source, { entityKey: 'e2e-keeper', type: 'character', name: 'Mira the Keeper', body: 'The keeper of the coast light.' });

    const clone = async (body: Record<string, unknown>): Promise<ProjectView> => {
      const response = await mutate(owner.ctx, 'post', `/api/v1/projects/${source}/clone`, { data: { name: `e2e-forge-clone-${Date.now().toString(36)}`, ...body } });
      expect(response.status(), await response.text()).toBe(201);
      const cloned = (await response.json()) as ProjectView;
      lane.track(cloned.id);
      return cloned;
    };

    const inherited = await clone({});
    expect(inherited).toEqual(expect.objectContaining({ wordTarget: TARGET, costTier: 'economy', instructions }));
    expect(await countBibleDocuments(inherited.id)).toBe(await countBibleDocuments(source));
    expect(await countEntities(inherited.id)).toBe(1);
    expect((await readVolumeRows(inherited.id)).map(volume => [volume.volumeKey, volume.title])).toEqual(
      (await readVolumeRows(source)).map(volume => [volume.volumeKey, volume.title]),
    );

    const overridden = await clone({ wordTarget: { min: 600, max: 900 } });
    expect(overridden.wordTarget).toEqual({ min: 600, max: 900 });
    expect((await readColumns(source))?.wordTargetMin, 'cloning leaves the source untouched').toBe(TARGET.min);
  });

  test('should list the owner’s projects most recently updated first', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'prj-order' });
    const older = await lane.project(owner, 'order-older');
    const newer = await lane.project(owner, 'order-newer');
    const ids = async (): Promise<string[]> => ((await (await owner.ctx.get('/api/v1/projects')).json()) as { items: { id: string }[] }).items.map(item => item.id);
    expect(await ids()).toEqual([newer, older]);

    expect((await mutate(owner.ctx, 'patch', `/api/v1/projects/${older}`, { data: { brief: 'Touched last.' } })).status()).toBe(200);
    expect(await ids()).toEqual([older, newer]);
  });

  test('should expose an uploaded cover only as an absolute URL and clear it on delete', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'prj-cover' });
    const projectId = await lane.project(owner, 'cover');
    const bytes = solidPng(24, 96, 160);

    const uploaded = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/cover`, { data: { mime: 'image/png', image: bytes.toString('base64') } });
    expect(uploaded.status(), await uploaded.text()).toBe(200);
    const body = (await uploaded.json()) as ProjectView;
    expect(body.coverUrl).toMatch(/^https?:\/\//);
    expect(body.coverUrl).toContain(storageRef(bytes));
    expect(body).not.toHaveProperty('coverImagePath');
    expect((await readColumns(projectId))?.coverImagePath).toBe(storageRef(bytes));

    const read = (await (await owner.ctx.get(`/api/v1/projects/${projectId}`)).json()) as ProjectView;
    expect(read.coverUrl).toBe(body.coverUrl);
    expect(read).not.toHaveProperty('coverImagePath');

    const cleared = await mutate(owner.ctx, 'delete', `/api/v1/projects/${projectId}/cover`);
    expect(cleared.status(), await cleared.text()).toBe(200);
    expect(((await (await owner.ctx.get(`/api/v1/projects/${projectId}`)).json()) as ProjectView).coverUrl ?? undefined).toBeUndefined();
    expect((await readColumns(projectId))?.coverImagePath).toBeNull();
  });

  test('should count chapters, drafts and volumes and report what a stage reset cleared', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'prj-status' });
    const { projectId } = await lane.imported(owner, buildBundle({ title: `E2E Status ${Date.now().toString(36)}`, volumes: [{ title: 'One', chapters: 2 }, { chapters: 1 }] }));
    const status = await owner.ctx.get(`/api/v1/projects/${projectId}/status`);
    expect(status.status(), await status.text()).toBe(200);
    expect(await status.json()).toEqual({ kind: 'new_novel', chaptersTotal: 3, chaptersFinal: 3, draftsTotal: 0, draftsFinal: 0, volumesTotal: 2 });

    await createEntity(owner.ctx, projectId, { entityKey: 'e2e-keeper', type: 'character', name: 'Mira the Keeper' });
    const reset = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/reset`, { data: { stage: 'knowledge' } });
    expect(reset.status(), await reset.text()).toBe(200);
    expect(await reset.json()).toEqual({ stage: 'knowledge', tablesCleared: ['entities', 'plotThreads', 'worldFacts', 'mysteries'] });
    expect(await countEntities(projectId)).toBe(0);
    expect(((await (await owner.ctx.get(`/api/v1/projects/${projectId}/status`)).json()) as { chaptersTotal: number }).chaptersTotal, 'a knowledge reset keeps the chapters').toBe(
      3,
    );

    await expectCode(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/reset`, { data: { stage: 'everything' } }), 422, 'VALIDATION_ERROR', 'an unknown stage');
  });
});
