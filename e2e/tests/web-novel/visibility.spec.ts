/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, readSeedManifest } from '../../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The security-critical contract of `NovelAccessService`: a RESTRICTED novel must be indistinguishable from a
 * novel that doesn't exist to anyone without a grant — same status code, same error code, same *bytes* — so an
 * attacker probing slugs can never learn "this exists but I can't read it" from "this doesn't exist" (an
 * enumeration/existence-oracle defense). `e2e-restricted-novel` is granted to `user1` only (seeded), so `user2`
 * is the negative authenticated case and guest is the negative anonymous case.
 */
test.describe('visibility security', () => {
  const { webNovel } = readSeedManifest();

  test('should 404 WBN_001 for a guest reading the restricted novel', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get(`/api/novels/${webNovel.restrictedSlug}`);
    expect(response.status()).toBe(404);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('WBN_001');
  });

  test('should 404 WBN_001 for user2 (no grant) reading the restricted novel', async () => {
    const ctx = await apiContext('webNovel', 'user2');
    const response = await ctx.get(`/api/novels/${webNovel.restrictedSlug}`);
    expect(response.status()).toBe(404);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('WBN_001');
  });

  /**
   * The enumeration-safety property itself: the ungranted-but-real slug and a genuinely nonexistent slug must
   * produce byte-identical response bodies. This is asserted for both the guest and the ungranted-authenticated
   * caller, since either is a plausible attacker vantage point.
   */
  for (const persona of [undefined, 'user2'] as const) {
    test(`should return a body identical to the unknown-slug 404 for ${persona ?? 'guest'}`, async () => {
      const ctx = await apiContext('webNovel', persona);
      const [restricted, unknown] = await Promise.all([ctx.get(`/api/novels/${webNovel.restrictedSlug}`), ctx.get('/api/novels/e2e-does-not-exist')]);
      expect(restricted.status()).toBe(404);
      expect(unknown.status()).toBe(404);
      expect(await restricted.text()).toBe(await unknown.text());
    });
  }

  test('should 200 with the title for user1 (granted)', async () => {
    const ctx = await apiContext('webNovel', 'user1');
    const response = await ctx.get(`/api/novels/${webNovel.restrictedSlug}`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { title?: string };
    expect(body.title, 'expected the restricted novel title in the granted response').toBeTruthy();
  });

  test('should include the restricted novel in /api/shared for user1 but not user2', async () => {
    const user1Ctx = await apiContext('webNovel', 'user1');
    const user1Shared = (await (await user1Ctx.get('/api/shared')).json()) as { items?: { slug: string }[] } | { slug: string }[];
    const user1Slugs = (Array.isArray(user1Shared) ? user1Shared : (user1Shared.items ?? [])).map(item => item.slug);
    expect(user1Slugs).toContain(webNovel.restrictedSlug);

    const user2Ctx = await apiContext('webNovel', 'user2');
    const user2Shared = (await (await user2Ctx.get('/api/shared')).json()) as { items?: { slug: string }[] } | { slug: string }[];
    const user2Slugs = (Array.isArray(user2Shared) ? user2Shared : (user2Shared.items ?? [])).map(item => item.slug);
    expect(user2Slugs).not.toContain(webNovel.restrictedSlug);
  });

  test('should gate the restricted novel chapters the same way as the novel itself', async () => {
    const guestCtx = await apiContext('webNovel');
    const guestChapter = await guestCtx.get(`/api/novels/${webNovel.restrictedSlug}/chapters/1`);
    expect(guestChapter.status()).toBe(404);
    const guestBody = (await guestChapter.json()) as { code?: string };
    expect(guestBody.code).toBe('WBN_001');

    const grantedCtx = await apiContext('webNovel', 'user1');
    const grantedChapter = await grantedCtx.get(`/api/novels/${webNovel.restrictedSlug}/chapters/1`);
    expect(grantedChapter.status()).toBe(200);
  });
});
