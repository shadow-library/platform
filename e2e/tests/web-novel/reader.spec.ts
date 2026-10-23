import { apiContext, readSeedManifest, requireProductUrl, storageStateFor } from '../../lib';
import { expect, test } from './fixtures';
import { listShelf, webNovelMutate } from './helpers';

/**
 * Reader state: progress (`ordinal`/`position`/monotonic `furthestOrdinal`) and library. Mutations run against `user2`, never `user1`: `user1`'s seeded progress on
 * `e2e-public-novel`
 * (`ordinal=2, furthest=2`) is what `wiki.spec.ts` reads to prove the spoiler gate, and parallel workers would race it; `user1`'s library row is likewise read elsewhere.
 * `user2` carries no seeded state, so nothing needs restoring.
 */
test.describe('reader features', () => {
  const { webNovel } = readSeedManifest();

  test('should report the seeded furthest ordinal for user1 on the public novel', async () => {
    const ctx = await apiContext('webNovel', 'user1');
    const response = await ctx.get(`/api/novels/${webNovel.publicSlug}/progress`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { ordinal: number; furthestOrdinal: number };
    expect(body.furthestOrdinal).toBe(2);
  });

  test('should keep furthestOrdinal monotonic across regressive and progressive PUTs', async () => {
    const ctx = await apiContext('webNovel', 'user2');

    const advance = await webNovelMutate(ctx, 'put', `/api/novels/${webNovel.publicSlug}/progress`, { data: { ordinal: 3, position: 1 } });
    expect(advance.status()).toBe(200);
    expect(((await advance.json()) as { furthestOrdinal: number }).furthestOrdinal).toBe(3);

    // furthestOrdinal is a high-water mark: reading an earlier chapter must not roll it back.
    const regress = await webNovelMutate(ctx, 'put', `/api/novels/${webNovel.publicSlug}/progress`, { data: { ordinal: 1, position: 0.5 } });
    expect(regress.status()).toBe(200);
    const regressBody = (await regress.json()) as { ordinal: number; furthestOrdinal: number };
    expect(regressBody.ordinal).toBe(1);
    expect(regressBody.furthestOrdinal, 'furthestOrdinal must not regress below its high-water mark').toBe(3);
  });

  /** `user1` has a grant on the restricted novel but no seeded `reading_progress` row for it, so this is a genuine "never opened" case, isolating WBN_006 from WBN_001. */
  test('should 404 WBN_006 for progress on a novel the reader has never opened', async () => {
    const ctx = await apiContext('webNovel', 'user1');
    const response = await ctx.get(`/api/novels/${webNovel.restrictedSlug}/progress`);
    expect(response.status()).toBe(404);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('WBN_006');
  });

  /** `WBN_004` is declared but never thrown; the class-level `@Authenticated()` guard on the reader controller throws the shared `IAM_001` (401), so the real code is asserted. */
  test('should 401 IAM_001 for an unauthenticated progress PUT', async () => {
    const ctx = await apiContext('webNovel');
    const response = await webNovelMutate(ctx, 'put', `/api/novels/${webNovel.publicSlug}/progress`, { data: { ordinal: 1, position: 0 } });
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('IAM_001');
  });

  test('should list the seeded public novel in user1 library', async () => {
    const ctx = await apiContext('webNovel', 'user1');
    const response = await ctx.get('/api/library');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { items?: { slug: string }[] } | { slug: string }[];
    const slugs = (Array.isArray(body) ? body : (body.items ?? [])).map(item => item.slug);
    expect(slugs).toContain(webNovel.publicSlug);
  });

  test('should add, list, and remove a library entry for user2 (idempotent delete)', async () => {
    const ctx = await apiContext('webNovel', 'user2');

    const added = await webNovelMutate(ctx, 'post', '/api/library', { data: { slug: webNovel.publicSlug } });
    expect(added.status()).toBe(204);

    const listed = await ctx.get('/api/library');
    const listedBody = (await listed.json()) as { items?: { slug: string }[] } | { slug: string }[];
    const slugs = (Array.isArray(listedBody) ? listedBody : (listedBody.items ?? [])).map(item => item.slug);
    expect(slugs).toContain(webNovel.publicSlug);

    const removed = await webNovelMutate(ctx, 'delete', `/api/library/${webNovel.publicSlug}`);
    expect(removed.status()).toBe(204);

    // No server-side existence check on DELETE: a second call on an already-absent row must succeed rather than 404, which is what idempotent means here.
    const removedAgain = await webNovelMutate(ctx, 'delete', `/api/library/${webNovel.publicSlug}`);
    expect(removedAgain.status()).toBe(204);
  });

  test('should 404 WBN_001 adding the restricted novel to the library as an ungranted user', async () => {
    const ctx = await apiContext('webNovel', 'user2');
    const response = await webNovelMutate(ctx, 'post', '/api/library', { data: { slug: webNovel.restrictedSlug } });
    expect(response.status()).toBe(404);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('WBN_001');
  });
});

/**
 * Per-reader scoping on fresh factory readers: the seeded public novel is the one row both point at, the case where a query missing its user filter would leak or delete across
 * readers.
 */
test.describe('reader data scoping', () => {
  const { webNovel: seeded } = readSeedManifest();

  test("should list and remove only the signed-in reader's own library rows", async ({ webNovel }) => {
    const { ctx: owner } = await webNovel.signIn(await webNovel.reader('shelf-owner'));
    const { ctx: other } = await webNovel.signIn(await webNovel.reader('shelf-other'));

    expect((await webNovelMutate(owner, 'post', '/api/library', { data: { slug: seeded.publicSlug } })).status()).toBe(204);
    expect(await listShelf(owner, '/api/library')).toContain(seeded.publicSlug);
    expect(await listShelf(other, '/api/library'), "another reader's shelf row must never surface").not.toContain(seeded.publicSlug);

    expect((await webNovelMutate(other, 'post', '/api/library', { data: { slug: seeded.publicSlug } })).status()).toBe(204);
    expect((await webNovelMutate(other, 'delete', `/api/library/${seeded.publicSlug}`)).status()).toBe(204);
    expect(await listShelf(other, '/api/library')).not.toContain(seeded.publicSlug);
    expect(await listShelf(owner, '/api/library'), "a reader's removal must not reach another reader's row for the same novel").toContain(seeded.publicSlug);
  });

  for (const path of ['/api/library', '/api/shared', '/api/me/progress'] as const) {
    test(`should 401 IAM_001 on GET ${path} for a guest and answer a signed-in reader`, async ({ webNovel }) => {
      const guest = await webNovel.guest();
      const refused = await guest.get(path);
      expect(refused.status()).toBe(401);
      expect(((await refused.json()) as { code?: string }).code).toBe('IAM_001');

      const { ctx } = await webNovel.signIn(await webNovel.reader('listing'));
      const answered = await ctx.get(path);
      expect(answered.status()).toBe(200);
      expect(((await answered.json()) as { items: unknown[] }).items).toEqual([]);
    });
  }
});

test.describe('library screen (signed in)', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should show the seeded library entry for a signed-in user', async ({ page }) => {
    const { webNovel } = readSeedManifest();
    const url = requireProductUrl('webNovel');
    await page.goto(`${url}/library`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href^="/read/${webNovel.publicSlug}/"]`).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('library screen (guest)', () => {
  test('should redirect a guest to login with a returnTo of /library', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(`${url}/library`);
    await expect(page).toHaveURL(/\/login\?returnTo=%2Flibrary|\/login\?returnTo=\/library/);
  });
});
