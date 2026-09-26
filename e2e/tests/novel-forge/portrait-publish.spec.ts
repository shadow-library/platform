/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, pollJob, subFor, webNovelDb } from '../../lib';
import { buildFinalBundle, deleteProjectQuietly, pollWebNovel, reconcileUntilConverged, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface ReaderWikiEntry {
  images: { imageUrl: string; caption?: string }[];
}

/**
 * Declaring the constants
 *
 * A portrait dated "as of chapter N" reaches readers only from chapter N on, AI-free. Two gallery images of one entity are dated to
 * before the story and to chapter 3; the reader wiki shows the first to everyone and the second only to a reader who has reached
 * chapter 3. Progress is written straight to the reader DB, as in the wiki spec, because the shared CSRF helper cannot mint a
 * web-novel token from a multi-app jar.
 */

test.describe.configure({ mode: 'serial', timeout: 150_000 });

const ENTITY_KEY = 'e2e-portrait-keeper';
const EARLY_CAPTION = 'Before the story';
const LATE_CAPTION = 'As of chapter 3';
const RED_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4oaEBAALUARkFUI+kAAAAAElFTkSuQmCC';
const BLUE_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQ0DgBAAGUARn8OyyYAAAAAElFTkSuQmCC';

async function setFurthestOrdinal(slug: string, ordinal: number): Promise<void> {
  await webNovelDb()`
    insert into reading_progress (user_id, novel_id, ordinal, position, furthest_ordinal, updated_at)
    select ${subFor('user1')}, id, ${ordinal}, 0, ${ordinal}, now() from novels where slug = ${slug}
    on conflict (user_id, novel_id) do update set furthest_ordinal = ${ordinal}, ordinal = ${ordinal}, updated_at = now()
  `;
}

test.describe('novel-forge chapter-dated portrait → reader', () => {
  const slug = `e2e-portrait-${uniqueSuffix()}`;
  const novelTitle = `E2E Portrait Novel ${uniqueSuffix()}`;
  let forgeCtx: APIRequestContext;
  let webGuestCtx: APIRequestContext;
  let webUser1Ctx: APIRequestContext;
  let projectId = '';

  test.beforeAll(async () => {
    forgeCtx = await apiContext('novelForge', 'user1');
    webGuestCtx = await apiContext('webNovel');
    webUser1Ctx = await apiContext('webNovel', 'user1');
  });

  test.afterAll(async () => {
    if (projectId) await deleteProjectQuietly(forgeCtx, projectId);
    await forgeCtx.dispose();
    await webGuestCtx.dispose();
    await webUser1Ctx.dispose();
  });

  test('should date two gallery images of one entity to before the story and to chapter 3', async () => {
    const importRes = await mutate(forgeCtx, 'post', '/api/v1/import', { data: { bundle: buildFinalBundle(novelTitle) } });
    expect(importRes.status(), await importRes.text()).toBe(202);
    const { projectId: pid, jobId } = (await importRes.json()) as { projectId: string; jobId: string };
    projectId = pid;
    expect((await pollJob<{ status: string }>(forgeCtx, jobId, { timeoutMs: 60_000 })).status).toBe('done');

    const entity = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/entities`, {
      data: { entityKey: ENTITY_KEY, type: 'character', name: 'Mira the Keeper', body: 'The keeper of the coast light for eleven winters.', significance: 'major' },
    });
    expect(entity.status(), await entity.text()).toBe(201);

    for (const [image, depictsChapter, caption] of [
      [RED_PIXEL, 0, EARLY_CAPTION],
      [BLUE_PIXEL, 3, LATE_CAPTION],
    ] as const) {
      const added = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/entities/${ENTITY_KEY}/images`, { data: { mime: 'image/png', image, depictsChapter, caption } });
      expect(added.status(), await added.text()).toBe(201);
    }

    const stored = (await (await forgeCtx.get(`/api/v1/projects/${projectId}/entities/${ENTITY_KEY}`)).json()) as { images?: { caption?: string; depictsChapter?: number }[] };
    expect(stored.images?.map(image => [image.caption, image.depictsChapter])).toEqual(
      expect.arrayContaining([
        [EARLY_CAPTION, 0],
        [LATE_CAPTION, 3],
      ]),
    );
  });

  test('should publish the novel and converge its chapters and the wiki entry', async () => {
    const publish = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/publish`, { data: { novelSlug: slug, title: novelTitle, genres: ['Fantasy'] } });
    expect(publish.status(), await publish.text()).toBe(200);
    for (const n of [1, 2, 3]) {
      const chapter = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/chapters/${n}/publish`, { data: {} });
      expect(chapter.status(), await chapter.text()).toBe(202);
    }

    const result = await reconcileUntilConverged(forgeCtx, projectId, [1, 2, 3], [ENTITY_KEY]);
    expect(result.failed, JSON.stringify(result.failed)).toEqual([]);
    expect(result.wiki.failed, JSON.stringify(result.wiki.failed)).toEqual([]);
    expect([...result.wiki.pushed, ...result.wiki.skipped]).toContain(ENTITY_KEY);
  });

  test('should show a guest only the portrait dated before the story', async () => {
    const entry = await pollWebNovel(webGuestCtx, `/api/novels/${slug}/wiki/${ENTITY_KEY}`, 200);
    expect(entry.status(), await entry.text()).toBe(200);
    expect(((await entry.json()) as ReaderWikiEntry).images.map(image => image.caption)).toEqual([EARLY_CAPTION]);
  });

  test('should keep the chapter-3 portrait from a reader at chapter 2 and show it once they reach chapter 3', async () => {
    await setFurthestOrdinal(slug, 2);
    const atTwo = (await (await webUser1Ctx.get(`/api/novels/${slug}/wiki/${ENTITY_KEY}`)).json()) as ReaderWikiEntry;
    expect(atTwo.images.map(image => image.caption)).toEqual([EARLY_CAPTION]);

    await setFurthestOrdinal(slug, 3);
    const atThree = (await (await webUser1Ctx.get(`/api/novels/${slug}/wiki/${ENTITY_KEY}`)).json()) as ReaderWikiEntry;
    expect(atThree.images.map(image => image.caption)).toEqual(expect.arrayContaining([EARLY_CAPTION, LATE_CAPTION]));
  });
});
