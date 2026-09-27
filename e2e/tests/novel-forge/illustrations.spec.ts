/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { type ForgeActor } from './forge-actors';
import { expectCode } from './forge-arrange';
import { expect, insertUnselectedIllustration, readIllustrationRows, setIllustrationStatus, solidPng, storageRef, test } from './forge-bundles';
import { createEntity, jsonOrUndefined } from './forge-helpers';

/**
 * Defining types
 */

interface IllustrationView {
  id: string;
  subjectType: string;
  status: string;
  origin: 'uploaded' | 'generated';
  selectedRef: string | null;
  attachedReferences: { source: string; sourceId?: string; role: string; note?: string }[];
  autoReferences: boolean;
  referenceWarnings?: { code: string; source: string; reason: string }[];
}

interface ReferenceOption {
  source: string;
  sourceId?: string;
  url: string;
}

interface ReferenceOptions {
  capacity: number;
  cover?: ReferenceOption;
  portraits: ReferenceOption[];
  gallery: ReferenceOption[];
  chapterImages: ReferenceOption[];
  candidates: ReferenceOption[];
  truncated: boolean;
  autoPreview: unknown[];
}

interface EntityView {
  images?: { id: string; caption?: string | null }[];
}

/**
 * Declaring the constants
 *
 * Everything the Illustrations tab does before an image model is involved: the uploaded-cover row a cover upload opens, the reference
 * options it lists, and the reference validation that runs from storage heads alone. Starting or refining an illustration would call the
 * image model and is out of scope; the lane fixture fails a test whose project records any model call. The image model accepts one
 * reference, and an uploaded cover's own image is always sent as the edit source, so a newly attached reference that resolves is refused
 * for capacity — the refusals below each fire before that check.
 */

const RED = solidPng(200, 30, 30);
const GREEN = solidPng(30, 170, 60);
const BLUE = solidPng(40, 60, 210);
const AMBER = solidPng(230, 160, 20);
const GREY = solidPng(120, 120, 120);

async function uploadCover(owner: ForgeActor, projectId: string, bytes: Buffer): Promise<APIResponse> {
  return mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/cover`, { data: { mime: 'image/png', image: bytes.toString('base64') } });
}

async function expectUploaded(owner: ForgeActor, projectId: string, bytes: Buffer): Promise<void> {
  const response = await uploadCover(owner, projectId, bytes);
  expect(response.status(), await response.text()).toBe(200);
}

async function coverRows(projectId: string): Promise<[string, string | null][]> {
  return (await readIllustrationRows(projectId)).filter(row => row.subjectType === 'cover').map(row => [row.status, row.selectedRef]);
}

async function addGalleryImage(owner: ForgeActor, projectId: string, entityKey: string, bytes: Buffer, caption: string): Promise<string> {
  const response = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities/${entityKey}/images`, {
    data: { mime: 'image/png', image: bytes.toString('base64'), caption, depictsChapter: 0 },
  });
  expect(response.status(), await response.text()).toBe(201);
  const id = ((await response.json()) as EntityView).images?.find(image => image.caption === caption)?.id;
  expect(id, `the gallery lists the image captioned ${caption}`).toBeDefined();
  return id ?? '';
}

async function setPortrait(owner: ForgeActor, projectId: string, entityKey: string, bytes: Buffer): Promise<void> {
  const response = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities/${entityKey}/image`, {
    data: { mime: 'image/png', image: bytes.toString('base64'), depictsChapter: 0 },
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function referenceOptions(owner: ForgeActor, projectId: string, query: Record<string, string>): Promise<APIResponse> {
  return owner.ctx.get(`/api/v1/projects/${projectId}/illustrations/reference-options?${new URLSearchParams(query)}`);
}

/** The uploaded-cover row: `id` when given, else the newest active cover row. */
async function uploadedCoverRow(owner: ForgeActor, projectId: string, id?: string): Promise<IllustrationView> {
  const listed = await owner.ctx.get(`/api/v1/projects/${projectId}/illustrations?subjectType=cover`);
  expect(listed.status(), await listed.text()).toBe(200);
  const row = ((await listed.json()) as { items: IllustrationView[] }).items.find(item => (id ? item.id === id : item.status === 'active'));
  expect(row, 'the cover upload opened an active row').toBeDefined();
  return row as IllustrationView;
}

test.describe('novel-forge uploaded covers', () => {
  test('should open one uploaded-cover row per cover set, none for a tracked ref or an outside write, and a fresh one beside a saved row', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'ill-covers' });
    const projectId = await lane.project(owner, 'covers');

    const concurrent = await Promise.all([uploadCover(owner, projectId, RED), uploadCover(owner, projectId, RED)]);
    expect(concurrent.map(response => response.status())).toEqual([200, 200]);
    expect(await coverRows(projectId), 'identical concurrent uploads collapse to one row').toEqual([['active', storageRef(RED)]]);
    const first = await uploadedCoverRow(owner, projectId);
    expect(first).toEqual(expect.objectContaining({ subjectType: 'cover', origin: 'uploaded', selectedRef: storageRef(RED), autoReferences: true, attachedReferences: [] }));

    await expectUploaded(owner, projectId, RED);
    await novelForgeDb()`UPDATE projects SET cover_image_path = ${storageRef(BLUE)} WHERE id = ${projectId}`;
    expect(await coverRows(projectId), 'the same ref again, or a cover written outside the upload, opens nothing').toEqual([['active', storageRef(RED)]]);

    await expectUploaded(owner, projectId, GREEN);
    expect(await coverRows(projectId), 'a distinct upload opens a row beside the first').toEqual([
      ['active', storageRef(RED)],
      ['active', storageRef(GREEN)],
    ]);

    const saved = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/illustrations/${first.id}/save`, { data: { target: 'cover' } });
    expect(saved.status(), await saved.text()).toBe(200);
    expect(((await saved.json()) as IllustrationView).status).toBe('saved');
    expect(await coverRows(projectId), 'saving an uploaded cover back as the cover opens nothing').toEqual([
      ['saved', storageRef(RED)],
      ['active', storageRef(GREEN)],
    ]);

    await expectUploaded(owner, projectId, GREEN);
    await expectUploaded(owner, projectId, RED);
    expect(await coverRows(projectId), 'a cover whose row is already saved opens a fresh active row').toEqual([
      ['saved', storageRef(RED)],
      ['active', storageRef(GREEN)],
      ['active', storageRef(RED)],
    ]);
  });
});

test.describe('novel-forge illustration references', () => {
  test("should list the project's own attachable images with a limit, and refuse an entity subject without a key", async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'ill-options' });
    const stranger = await forge.actor({ label: 'ill-options-other' });
    const projectId = await lane.project(owner, 'options');
    const foreignProject = await lane.project(stranger, 'options-foreign');

    await expectUploaded(owner, projectId, RED);
    await createEntity(owner.ctx, projectId, { entityKey: 'e2e-keeper', type: 'character', name: 'Mira the Keeper' });
    await setPortrait(owner, projectId, 'e2e-keeper', BLUE);
    const galleryIds = [await addGalleryImage(owner, projectId, 'e2e-keeper', GREEN, 'On the stair'), await addGalleryImage(owner, projectId, 'e2e-keeper', AMBER, 'At the rail')];
    const scene = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/1/images`, {
      data: { mime: 'image/png', image: GREY.toString('base64'), caption: 'The lamp room' },
    });
    expect(scene.status(), await scene.text()).toBe(201);

    await createEntity(stranger.ctx, foreignProject, { entityKey: 'e2e-rival', type: 'character', name: 'Odo the Assessor' });
    await setPortrait(stranger, foreignProject, 'e2e-rival', AMBER);
    const foreignGallery = await addGalleryImage(stranger, foreignProject, 'e2e-rival', GREY, 'Foreign');
    await expectUploaded(stranger, foreignProject, GREEN);

    await expectCode(await referenceOptions(owner, projectId, { subjectType: 'entity' }), 400, 'ILL_006', 'an entity subject without a key');
    await expectCode(await referenceOptions(owner, projectId, { subjectType: 'chapter', subjectKey: 'one' }), 400, 'ILL_006', 'a chapter subject that is not a number');

    const response = await referenceOptions(owner, projectId, { subjectType: 'cover' });
    expect(response.status(), await response.text()).toBe(200);
    const options = (await response.json()) as ReferenceOptions;
    const coverRow = await uploadedCoverRow(owner, projectId);
    expect(options.capacity).toBe(1);
    expect(options.cover?.url).toContain(storageRef(RED));
    expect(options.portraits.map(option => [option.sourceId, option.url.includes(storageRef(BLUE))])).toEqual([['e2e-keeper', true]]);
    expect(options.gallery.map(option => option.sourceId).sort()).toEqual([...galleryIds].sort());
    expect(options.gallery.map(option => option.sourceId)).not.toContain(foreignGallery);
    expect(options.chapterImages.map(option => option.url.includes(storageRef(GREY)))).toEqual([true]);
    expect(options.candidates.map(option => option.sourceId)).toEqual([coverRow.id]);
    expect(options.truncated).toBe(false);

    const limited = (await (await referenceOptions(owner, projectId, { subjectType: 'cover', limit: '1' })).json()) as ReferenceOptions;
    expect(limited.gallery).toHaveLength(1);
    expect(limited.truncated).toBe(true);

    const ownKey = (await (await referenceOptions(owner, projectId, { subjectType: 'entity', subjectKey: 'e2e-keeper' })).json()) as ReferenceOptions;
    expect(ownKey.autoPreview, "the project's own entity previews its portrait").toEqual([
      expect.objectContaining({ source: 'portrait', sourceId: 'e2e-keeper', role: 'likeness', origin: 'auto', ref: storageRef(BLUE) }),
    ]);
    const foreignKey = (await (await referenceOptions(owner, projectId, { subjectType: 'entity', subjectKey: 'e2e-rival' })).json()) as ReferenceOptions;
    expect(foreignKey.autoPreview, "another project's entity key previews nothing").toEqual([]);

    const listed = await owner.ctx.get(`/api/v1/projects/${projectId}/illustrations`);
    expect(((await listed.json()) as { items: IllustrationView[] }).items.map(item => item.id)).toEqual([coverRow.id]);
    await expectCode(await stranger.ctx.get(`/api/v1/projects/${projectId}/illustrations`), 404, 'PRJ_001', "another owner's illustrations");
    await expectCode(await referenceOptions(stranger, projectId, { subjectType: 'cover' }), 404, 'PRJ_001', "another owner's reference options");
  });

  test('should validate attached references without any model call and store only a set that resolves', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'ill-refs' });
    const stranger = await forge.actor({ label: 'ill-refs-other' });
    const projectId = await lane.project(owner, 'refs');
    const foreignProject = await lane.project(stranger, 'refs-foreign');

    await expectUploaded(owner, projectId, RED);
    const cover = await uploadedCoverRow(owner, projectId);
    await createEntity(owner.ctx, projectId, { entityKey: 'e2e-faceless', type: 'character', name: 'The Faceless Pilot' });
    await createEntity(owner.ctx, projectId, { entityKey: 'e2e-keeper', type: 'character', name: 'Mira the Keeper' });
    await setPortrait(owner, projectId, 'e2e-keeper', BLUE);
    const unselected = await insertUnselectedIllustration(projectId, 'cover');

    await createEntity(stranger.ctx, foreignProject, { entityKey: 'e2e-rival', type: 'character', name: 'Odo the Assessor' });
    await setPortrait(stranger, foreignProject, 'e2e-rival', AMBER);
    const foreignGallery = await addGalleryImage(stranger, foreignProject, 'e2e-rival', GREY, 'Foreign');
    await expectUploaded(stranger, foreignProject, GREEN);
    const foreignCover = await uploadedCoverRow(stranger, foreignProject);

    const url = `/api/v1/projects/${projectId}/illustrations/${cover.id}/references`;
    const attach = (references: Record<string, unknown>[], extra: Record<string, unknown> = {}): Promise<APIResponse> =>
      mutate(owner.ctx, 'put', url, { data: { references, ...extra } });

    await expectCode(await attach([{ source: 'candidate', sourceId: unselected, role: 'style' }]), 404, 'ILL_010', 'a candidate with nothing selected');
    await expectCode(await attach([{ source: 'portrait', sourceId: 'e2e-faceless', role: 'likeness' }]), 404, 'ILL_010', 'a portrait-less entity');
    await expectCode(await attach([{ source: 'portrait', sourceId: 'e2e-rival', role: 'likeness' }]), 404, 'ILL_010', "another project's entity key");
    const foreign = await attach([{ source: 'gallery', sourceId: foreignGallery, role: 'style' }]);
    const missing = await attach([{ source: 'gallery', sourceId: '9000000000000000000', role: 'style' }]);
    const refusal = async (response: APIResponse): Promise<unknown[]> => {
      const body = await jsonOrUndefined<{ code?: string; message?: string }>(response);
      return [response.status(), body?.code, body?.message];
    };
    expect(await refusal(foreign), "another project's gallery id reads exactly like a missing one").toEqual(await refusal(missing));
    expect(missing.status()).toBe(404);
    await expectCode(await attach([{ source: 'gallery', sourceId: 'first', role: 'style' }]), 400, 'ILL_009', 'a non-numeric gallery id');
    await expectCode(await attach([{ source: 'gallery', sourceId: '99999999999999999999', role: 'style' }]), 400, 'ILL_009', 'an out-of-range gallery id');
    await expectCode(await attach([{ source: 'cover', sourceId: '1', role: 'style' }]), 400, 'ILL_009', 'a cover reference naming an id');
    await expectCode(await attach([{ source: 'portrait', sourceId: '   ', role: 'likeness' }]), 400, 'ILL_009', 'a blank entity key');
    await expectCode(await attach([{ source: 'cover', role: 'edit-source' }]), 422, 'VALIDATION_ERROR', 'a client-chosen edit-source role');
    await expectCode(await attach([{ source: 'portrait', sourceId: 'e2e-keeper', role: 'likeness' }]), 400, 'ILL_011', 'a reference past the one slot beside the edit source');
    await expectCode(
      await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/illustrations/${foreignCover.id}/references`, { data: { references: [] } }),
      404,
      'ILL_001',
      "another owner's illustration id",
    );
    await expectCode(await mutate(stranger.ctx, 'put', url, { data: { references: [] } }), 404, 'PRJ_001', "another owner's project");
    expect((await uploadedCoverRow(owner, projectId, cover.id)).attachedReferences, 'a refused set is never stored').toEqual([]);

    const note = 'Keep the palette only.';
    const merged = await attach([{ source: 'cover', role: 'style', note }]);
    expect(merged.status(), await merged.text()).toBe(200);
    const mergedBody = (await merged.json()) as IllustrationView;
    expect(mergedBody.referenceWarnings).toEqual([
      expect.objectContaining({ code: 'merged-with-edit-source', source: 'cover', reason: expect.stringContaining('note was not applied') }),
    ]);
    expect(mergedBody.attachedReferences).toEqual([{ source: 'cover', role: 'style', note }]);

    const cleared = await attach([], { autoReferences: false });
    expect(cleared.status(), await cleared.text()).toBe(200);
    expect(await cleared.json()).toEqual(expect.objectContaining({ attachedReferences: [], autoReferences: false }));

    expect((await mutate(owner.ctx, 'delete', `/api/v1/projects/${projectId}/cover`)).status()).toBe(200);
    await expectCode(await attach([{ source: 'cover', role: 'style' }]), 404, 'ILL_010', 'a cover reference on a cover-less project');

    await setIllustrationStatus(cover.id, 'discarded');
    await expectCode(await attach([]), 400, 'ILL_002', 'an illustration that is no longer active');
  });
});
