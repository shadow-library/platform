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
 * The wiki spoiler gate on `e2e-public-novel`: `the-protagonist` is visible from ordinal 0 (pre-reading), and
 * `the-ancient-order` unlocks at ordinal 2 with a facet (`secret-origin`) that stays hidden until ordinal 3 even
 * once the entry itself is visible (`hiddenFacetCount`). A guest's gate is 0, so only the pre-reading entry is
 * ever visible to them; `user1`'s seeded `furthestOrdinal` is 2 (read, never mutated, by this spec — see
 * `reader.spec.ts`'s note on why progress mutations run against `user2` instead), which is exactly the unlock
 * ordinal for the locked entry, so this doubles as a boundary check (`>=`, not `>`).
 */
test.describe('wiki gating', () => {
  const { webNovel } = readSeedManifest();
  const visibleKey = 'the-protagonist';
  const lockedKey = 'the-ancient-order';

  test('should list only the pre-reading entry for a guest, with lockedCount >= 1', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get(`/api/novels/${webNovel.publicSlug}/wiki`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { items: { entryKey: string }[]; lockedCount: number };

    const keys = body.items.map(item => item.entryKey);
    expect(keys).toContain(visibleKey);
    expect(keys).not.toContain(lockedKey);
    expect(body.lockedCount).toBeGreaterThanOrEqual(1);
  });

  test('should 404 WBN_009 for a guest fetching the locked entry directly', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get(`/api/novels/${webNovel.publicSlug}/wiki/${lockedKey}`);
    expect(response.status()).toBe(404);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('WBN_009');
  });

  test('should show the locked entry to user1 (furthest 2 meets the gate of 2)', async () => {
    const ctx = await apiContext('webNovel', 'user1');
    const index = await ctx.get(`/api/novels/${webNovel.publicSlug}/wiki`);
    const indexBody = (await index.json()) as { items: { entryKey: string }[] };
    expect(indexBody.items.map(item => item.entryKey)).toContain(lockedKey);

    const entry = await ctx.get(`/api/novels/${webNovel.publicSlug}/wiki/${lockedKey}`);
    expect(entry.status()).toBe(200);
    const entryBody = (await entry.json()) as { hiddenFacetCount: number };
    // The `secret-origin` facet unlocks at ordinal 3, one past user1's furthest of 2 — the entry itself is
    // visible, but that facet must stay counted as hidden rather than leak through.
    expect(entryBody.hiddenFacetCount).toBeGreaterThanOrEqual(1);
  });

  test('should 404 with the same shape as a locked entry for a nonexistent entryKey', async () => {
    const ctx = await apiContext('webNovel');
    const [locked, missing] = await Promise.all([
      ctx.get(`/api/novels/${webNovel.publicSlug}/wiki/${lockedKey}`),
      ctx.get(`/api/novels/${webNovel.publicSlug}/wiki/no-such-entry`),
    ]);
    expect(locked.status()).toBe(404);
    expect(missing.status()).toBe(404);
    const lockedBody = (await locked.json()) as { code?: string };
    const missingBody = (await missing.json()) as { code?: string };
    expect(missingBody.code).toBe('WBN_009');
    expect(missingBody.code).toBe(lockedBody.code);
  });
});
