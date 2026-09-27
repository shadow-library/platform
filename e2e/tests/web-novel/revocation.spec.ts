/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { expect, test } from './fixtures';
import {
  arrangeNovel,
  deleteNovels,
  grantNovel,
  listProgressSlugs,
  listShelf,
  recordProgress,
  revokeGrant,
  shelveNovel,
  uniqueNovelSlug,
  UNKNOWN_SLUG,
  webNovelMutate,
} from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A revoked RESTRICTED share must stop working on the reader's next request. Per-user grants are read from Postgres on every request
 * (only organisation membership is cached), so every assertion runs straight after the revoke instead of polling for it.
 */

async function errorCode(response: { json(): Promise<unknown> }): Promise<string | undefined> {
  return ((await response.json()) as { code?: string }).code;
}

async function expectReadable(ctx: APIRequestContext, slug: string): Promise<void> {
  expect(await listShelf(ctx, '/api/library')).toContain(slug);
  expect(await listShelf(ctx, '/api/shared')).toContain(slug);
  expect(await listProgressSlugs(ctx)).toContain(slug);
  expect((await ctx.get(`/api/novels/${slug}`)).status()).toBe(200);
  expect((await ctx.get(`/api/novels/${slug}/chapters/1`)).status()).toBe(200);
}

test.describe('web-novel live revocation', () => {
  const slugs: string[] = [];

  test.afterEach(async () => {
    await deleteNovels(slugs.splice(0));
  });

  test("should drop a revoked novel from the reader's library, shared shelf, progress, detail and chapters at once", async ({ webNovel }) => {
    const slug = uniqueNovelSlug('revoke');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'RESTRICTED', chapters: 2 });
    const revoked = await webNovel.reader('revoked');
    const kept = await webNovel.reader('kept');
    for (const reader of [revoked, kept]) {
      await grantNovel(novel, reader.user.userId);
      await shelveNovel(novel, reader.user.userId);
      await recordProgress(novel, reader.user.userId, 2);
    }
    const { ctx: revokedCtx } = await webNovel.signIn(revoked);
    const { ctx: keptCtx } = await webNovel.signIn(kept);
    await expectReadable(revokedCtx, slug);

    await revokeGrant(novel, revoked.user.userId);

    expect(await listShelf(revokedCtx, '/api/library'), 'a shelf row still carries the revoked title and cover').not.toContain(slug);
    expect(await listShelf(revokedCtx, '/api/shared')).not.toContain(slug);
    expect(await listProgressSlugs(revokedCtx)).not.toContain(slug);

    for (const path of ['', '/chapters/1', '/progress']) {
      const [revokedRead, unknownRead] = await Promise.all([revokedCtx.get(`/api/novels/${slug}${path}`), revokedCtx.get(`/api/novels/${UNKNOWN_SLUG}${path}`)]);
      expect(revokedRead.status(), `GET /api/novels/:slug${path}`).toBe(404);
      expect(await revokedRead.text(), `a revoked novel's ${path || 'detail'} must be indistinguishable from a missing novel's`).toBe(await unknownRead.text());
    }

    await expectReadable(keptCtx, slug);
  });

  test('should refuse a revoked reader new progress and shelving, keep shelf removal open, and restore reads on a re-grant', async ({ webNovel }) => {
    const slug = uniqueNovelSlug('revoke-writes');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'RESTRICTED', chapters: 1 });
    const reader = await webNovel.reader('revoked-writes');
    await grantNovel(novel, reader.user.userId);
    await shelveNovel(novel, reader.user.userId);
    const { ctx } = await webNovel.signIn(reader);
    expect(await listShelf(ctx, '/api/library')).toContain(slug);

    await revokeGrant(novel, reader.user.userId);

    const saved = await webNovelMutate(ctx, 'put', `/api/novels/${slug}/progress`, { data: { ordinal: 1, position: 0.5 } });
    expect(saved.status()).toBe(404);
    expect(await errorCode(saved)).toBe('WBN_001');

    const removed = await webNovelMutate(ctx, 'delete', `/api/library/${slug}`);
    expect(removed.status(), 'a reader must be able to clear a shelf row for a novel they can no longer read').toBe(204);

    const shelved = await webNovelMutate(ctx, 'post', '/api/library', { data: { slug } });
    expect(shelved.status()).toBe(404);
    expect(await errorCode(shelved)).toBe('WBN_001');

    await grantNovel(novel, reader.user.userId);

    expect((await ctx.get(`/api/novels/${slug}`)).status()).toBe(200);
    expect(await listShelf(ctx, '/api/library'), 'the removal landed and the refused re-shelve wrote nothing').not.toContain(slug);
    const progress = await ctx.get(`/api/novels/${slug}/progress`);
    expect(progress.status()).toBe(404);
    expect(await errorCode(progress), 'the refused progress save wrote nothing').toBe('WBN_006');

    expect((await webNovelMutate(ctx, 'post', '/api/library', { data: { slug } })).status()).toBe(204);
    expect(await listShelf(ctx, '/api/library')).toContain(slug);
  });

  test("should answer a never-granted reader's shelf removal on a restricted novel exactly as on an unknown slug", async ({ webNovel }) => {
    const slug = uniqueNovelSlug('revoke-oracle');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'RESTRICTED', chapters: 1 });
    const granted = await webNovel.reader('oracle-granted');
    await grantNovel(novel, granted.user.userId);
    await shelveNovel(novel, granted.user.userId);
    const { ctx: probe } = await webNovel.signIn(await webNovel.reader('oracle-probe'));
    const { ctx: grantedCtx } = await webNovel.signIn(granted);

    const restricted = await webNovelMutate(probe, 'delete', `/api/library/${slug}`);
    const unknown = await webNovelMutate(probe, 'delete', `/api/library/${UNKNOWN_SLUG}`);
    expect(restricted.status()).toBe(unknown.status());
    expect(await restricted.text(), 'a shelf removal must not reveal that a restricted slug exists').toBe(await unknown.text());
    expect(restricted.status()).toBe(204);

    expect(await listShelf(grantedCtx, '/api/library')).toContain(slug);
    expect((await webNovelMutate(grantedCtx, 'delete', `/api/library/${slug}`)).status()).toBe(204);
    expect(await listShelf(grantedCtx, '/api/library')).not.toContain(slug);
  });
});
