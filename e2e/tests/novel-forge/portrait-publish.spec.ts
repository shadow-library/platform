/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, runAll, subFor, webNovelDb } from '../../lib';
import { buildBundle, expect, solidPng, test } from './forge-bundles';
import { pollWebNovel, reconcileUntilConverged, uniqueSuffix } from './forge-helpers';

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
 * chapter 3. The novel belongs to a fresh actor; user1 only reads it. Progress is written straight to the reader DB, as in the wiki
 * spec, because the shared CSRF helper cannot mint a web-novel token from a multi-app jar; the rows cascade with the novel.
 */

const ENTITY_KEY = 'e2e-portrait-keeper';
const EARLY_CAPTION = 'Before the story';
const LATE_CAPTION = 'As of chapter 3';
const EARLY_PORTRAIT = solidPng(210, 90, 70).toString('base64');
const LATE_PORTRAIT = solidPng(70, 90, 210).toString('base64');

async function setFurthestOrdinal(slug: string, ordinal: number): Promise<void> {
  await webNovelDb()`
    insert into reading_progress (user_id, novel_id, ordinal, position, furthest_ordinal, updated_at)
    select ${subFor('user1')}, id, ${ordinal}, 0, ${ordinal}, now() from novels where slug = ${slug}
    on conflict (user_id, novel_id) do update set furthest_ordinal = ${ordinal}, ordinal = ${ordinal}, updated_at = now()
  `;
}

async function readerCaptions(ctx: APIRequestContext, slug: string): Promise<(string | undefined)[]> {
  return ((await (await ctx.get(`/api/novels/${slug}/wiki/${ENTITY_KEY}`)).json()) as ReaderWikiEntry).images.map(image => image.caption);
}

test.describe('novel-forge chapter-dated portrait → reader', () => {
  test('should show a portrait dated to chapter 3 only to a reader who has reached chapter 3', async ({ forge, lane }) => {
    test.setTimeout(180_000);
    const owner = await forge.actor({ label: 'portrait' });
    const webGuestCtx = await apiContext('webNovel');
    const webUser1Ctx = await apiContext('webNovel', 'user1');
    try {
      const novelTitle = `E2E Portrait Novel ${uniqueSuffix()}`;
      const slug = lane.slug('portrait');
      const { projectId } = await lane.imported(owner, buildBundle({ title: novelTitle }));

      const entity = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities`, {
        data: { entityKey: ENTITY_KEY, type: 'character', name: 'Mira the Keeper', body: 'The keeper of the coast light for eleven winters.', significance: 'major' },
      });
      expect(entity.status(), await entity.text()).toBe(201);
      for (const [image, depictsChapter, caption] of [
        [EARLY_PORTRAIT, 0, EARLY_CAPTION],
        [LATE_PORTRAIT, 3, LATE_CAPTION],
      ] as const) {
        const added = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/entities/${ENTITY_KEY}/images`, {
          data: { mime: 'image/png', image, depictsChapter, caption },
        });
        expect(added.status(), await added.text()).toBe(201);
      }
      const stored = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/entities/${ENTITY_KEY}`)).json()) as { images?: { caption?: string; depictsChapter?: number }[] };
      expect(stored.images?.map(image => [image.caption, image.depictsChapter])).toEqual(
        expect.arrayContaining([
          [EARLY_CAPTION, 0],
          [LATE_CAPTION, 3],
        ]),
      );

      const publish = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/publish`, { data: { novelSlug: slug, title: novelTitle, genres: ['Fantasy'] } });
      expect(publish.status(), await publish.text()).toBe(200);
      for (const n of [1, 2, 3]) {
        const chapter = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/${n}/publish`, { data: {} });
        expect(chapter.status(), await chapter.text()).toBe(202);
      }
      const result = await reconcileUntilConverged(owner.ctx, projectId, [1, 2, 3], [ENTITY_KEY]);
      expect(result.failed, JSON.stringify(result.failed)).toEqual([]);
      expect(result.wiki.failed, JSON.stringify(result.wiki.failed)).toEqual([]);
      expect([...result.wiki.pushed, ...result.wiki.skipped]).toContain(ENTITY_KEY);

      const entry = await pollWebNovel(webGuestCtx, `/api/novels/${slug}/wiki/${ENTITY_KEY}`, 200);
      expect(entry.status(), await entry.text()).toBe(200);
      expect(await readerCaptions(webGuestCtx, slug), 'a guest sees only the portrait dated before the story').toEqual([EARLY_CAPTION]);

      await setFurthestOrdinal(slug, 2);
      expect(await readerCaptions(webUser1Ctx, slug)).toEqual([EARLY_CAPTION]);
      await setFurthestOrdinal(slug, 3);
      expect(await readerCaptions(webUser1Ctx, slug)).toEqual(expect.arrayContaining([EARLY_CAPTION, LATE_CAPTION]));
    } finally {
      await runAll([() => webGuestCtx.dispose(), () => webUser1Ctx.dispose()]);
    }
  });
});
