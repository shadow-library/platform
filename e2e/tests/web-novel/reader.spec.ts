/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, readSeedManifest, requireProductUrl, storageStateFor } from '../../lib';
import { webNovelMutate } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Reader-state coverage: progress (per-novel `ordinal`/`position`/monotonic `furthestOrdinal`) and library
 * (add/remove). Progress mutations deliberately run against `user2`, never `user1` — `user1`'s seeded progress on
 * `e2e-public-novel` (`ordinal=2, furthest=2`) is the fixture `wiki.spec.ts` reads to prove the spoiler gate opens
 * at the reader's furthest chapter, and these specs run in parallel workers, so mutating it here would race that
 * assertion. Library mutations use `user2` for the same reason — `user1`'s seeded library row is read (not
 * written) elsewhere. Nothing here needs restoring: `user2` carries no seeded progress/library state to begin
 * with, and the suite reseeds `user1`'s fixtures on every run regardless.
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

    // Reading back to an earlier chapter must not roll furthestOrdinal backwards — it's a high-water mark.
    const regress = await webNovelMutate(ctx, 'put', `/api/novels/${webNovel.publicSlug}/progress`, { data: { ordinal: 1, position: 0.5 } });
    expect(regress.status()).toBe(200);
    const regressBody = (await regress.json()) as { ordinal: number; furthestOrdinal: number };
    expect(regressBody.ordinal).toBe(1);
    expect(regressBody.furthestOrdinal, 'furthestOrdinal must not regress below its high-water mark').toBe(3);
  });

  /**
   * `user1` has a grant on the restricted novel (so the read is authorized) but no seeded `reading_progress` row
   * for it specifically — the seed only writes progress for the public novel — so this is a genuine "never opened"
   * case rather than an access-denied one, isolating WBN_006 from WBN_001.
   */
  test('should 404 WBN_006 for progress on a novel the reader has never opened', async () => {
    const ctx = await apiContext('webNovel', 'user1');
    const response = await ctx.get(`/api/novels/${webNovel.restrictedSlug}/progress`);
    expect(response.status()).toBe(404);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('WBN_006');
  });

  /**
   * The web-novel report anticipated `WBN_004` for an unauthenticated call, but `WBN_004` is dead code: it's
   * declared (`apps/web-novel-server/src/classes/app-error-code.ts:44`) but never thrown anywhere in
   * `web-novel-server`'s source. The class-level `@Authenticated()` guard on the reader controller throws the
   * shared platform code instead — confirmed live via `curl`: `401 {"code":"IAM_001","message":"Authentication
   * required"}`. The status (401, unauthenticated) is correct; only the code differs from the report, so this
   * asserts the real code rather than `test.fixme()`-ing a working auth gate.
   */
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

    // DELETE has no existence check server-side (per the report) — a second call against an already-absent row
    // must still succeed rather than 404, which is what "idempotent" means for this endpoint.
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

test.describe('library screen (signed in)', () => {
  test.use({ storageState: storageStateFor('user1') });

  /**
   * APP BUG (suspected) — `GET /api/library` itself is correct (confirmed both by the API-level test above and
   * by direct `curl` with `user1`'s session cookie: `{"items":[{"slug":"e2e-public-novel", ...}]}`), but the
   * `/library` screen renders "0 saved novels" / the "Nothing here yet" empty state instead, every time, not
   * flakily. Root cause traced to `apps/web-novel-web/src/lib/apis/library.api.ts:75-91` —
   * `libraryQueryOptions(userId)` builds its React Query cache entry under the **static** key
   * `libraryKeys.all = ['library']` (`:34-36`), which does not include `userId`, and the query has no `enabled`
   * gate on the session having resolved. `library-screen.tsx:90-91` mounts `useQuery(sessionQueryOptions())`
   * and `useQuery(libraryQueryOptions(session.data?.userId))` side by side; on first render `session.data` is
   * still `undefined`, so the library query fires immediately with `userId=undefined`, its `queryFn` returns
   * the (empty, for a fresh browser context) local-only device shelf, and that result is cached permanently
   * under the same `['library']` key. Once the session resolves a render later, `libraryQueryOptions` is
   * reconstructed with the real `userId`, but because the query key never changed, React Query treats it as
   * the same already-`success` query and never refetches — the server truth is never merged in. The "shared"
   * section renders correctly because `sharedQueryOptions` is a *separate* query, unaffected by this key
   * collision. Suspected fix: key the query on `userId` (e.g. `['library', userId]`) and/or `enabled:
   * session.isSuccess`.
   */
  test.fixme('should show the seeded library entry for a signed-in user', async ({ page }) => {
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
