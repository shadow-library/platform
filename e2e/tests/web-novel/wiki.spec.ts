/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { apiContext, readSeedManifest } from '../../lib';
import { expect, test } from './fixtures';
import { arrangeNovel, arrangeWikiEntry, deleteNovels, fakeImageRef, grantNovel, setFurthestOrdinal, uniqueNovelSlug, UNKNOWN_SLUG } from './helpers';

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

/**
 * Progressive reveal beyond the single before/after gate above: the visible-entry set widening and `lockedCount`
 * shrinking across three ordinals, on a throwaway reader and a novel this spec owns outright, so nothing here
 * touches `user1`'s seeded gate that the block above depends on.
 */
test.describe('wiki progressive reveal', () => {
  const slugs: string[] = [];

  test.afterEach(async () => {
    await deleteNovels(slugs.splice(0));
  });

  test('should widen the visible entry set and shrink lockedCount as a reader advances across three ordinals, never leaking imageUrl for an unillustrated entry', async ({
    webNovel,
  }) => {
    const slug = uniqueNovelSlug('wiki-widen');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'PUBLIC', chapters: 6 });
    await arrangeWikiEntry(novel, { entryKey: 'always-visible', firstVisibleOrdinal: 0 });
    await arrangeWikiEntry(novel, { entryKey: 'partial-reveal', firstVisibleOrdinal: 2 });
    await arrangeWikiEntry(novel, { entryKey: 'late-reveal', firstVisibleOrdinal: 5 });

    const reader = await webNovel.reader('wiki-widen');
    const { ctx } = await webNovel.signIn(reader);

    const gates = [
      { ordinal: 0, keys: ['always-visible'], locked: 2 },
      { ordinal: 2, keys: ['always-visible', 'partial-reveal'], locked: 1 },
      { ordinal: 5, keys: ['always-visible', 'late-reveal', 'partial-reveal'], locked: 0 },
    ];
    for (const gate of gates) {
      await setFurthestOrdinal(novel, reader.user.userId, gate.ordinal);
      const response = await ctx.get(`/api/novels/${slug}/wiki`);
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { items: { entryKey: string }[]; lockedCount: number };
      expect(body.items.map(item => item.entryKey).sort()).toEqual(gate.keys);
      expect(body.lockedCount).toBe(gate.locked);
    }

    const list = await ctx.get(`/api/novels/${slug}/wiki`);
    const listBody = (await list.json()) as { items: Record<string, unknown>[] };
    const alwaysVisible = listBody.items.find(item => item.entryKey === 'always-visible');
    expect(Object.hasOwn(alwaysVisible ?? {}, 'imageUrl'), 'an entry with no image must omit imageUrl entirely, not send an empty string').toBe(false);

    const detail = await ctx.get(`/api/novels/${slug}/wiki/always-visible`);
    const detailBody = (await detail.json()) as Record<string, unknown>;
    expect(Object.hasOwn(detailBody, 'imageUrl')).toBe(false);
  });

  /**
   * Facet- and image-level gating *within* one already-visible entry, tracked independently of the entry's own
   * `firstVisibleOrdinal` and of each other — plus 2469d4ea's headline-portrait gate (`gatedImageRef` /
   * `imageVisibleFromOrdinal`), which the wiki-read plan predates: the entry's headline can itself be gated to a
   * later chapter than the entry, the list falls back to the latest reached gallery image while it's locked, and
   * the entry page never does (`WikiService.getEntry` calls `visibleHeadlineRef`, never `listThumbnailRef`).
   * Each gated element is asserted locked, then unlocked once the reader's own gate reaches it — the positive
   * control the brief requires for every spoiler gate here.
   */
  test('should gate a facet and a chapter-depicting headline portrait independently within one visible entry, revealing both once the gate reaches them', async ({ webNovel }) => {
    const slug = uniqueNovelSlug('wiki-gate');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'PUBLIC', chapters: 6 });

    const galleryRef = fakeImageRef(`${slug}-gallery`);
    const headlineRef = fakeImageRef(`${slug}-headline`);

    await arrangeWikiEntry(novel, {
      entryKey: 'partial-reveal',
      firstVisibleOrdinal: 0,
      facets: [
        { facetKey: 'facet-early', content: 'Visible from the start.', visibleFromOrdinal: 0 },
        { facetKey: 'facet-late', content: 'A later reveal.', visibleFromOrdinal: 5 },
      ],
    });
    await arrangeWikiEntry(novel, {
      entryKey: 'gated-portrait',
      firstVisibleOrdinal: 0,
      gatedImageRef: headlineRef,
      imageVisibleFromOrdinal: 5,
      images: [{ imageRef: galleryRef, visibleFromOrdinal: 2 }],
    });

    const reader = await webNovel.reader('wiki-gate');
    const { ctx } = await webNovel.signIn(reader);

    await setFurthestOrdinal(novel, reader.user.userId, 2);
    const facetAt2 = await ctx.get(`/api/novels/${slug}/wiki/partial-reveal`);
    expect(facetAt2.status()).toBe(200);
    const facetBody2 = (await facetAt2.json()) as { facets: { facetKey: string }[]; hiddenFacetCount: number };
    expect(facetBody2.facets.map(f => f.facetKey)).toEqual(['facet-early']);
    expect(facetBody2.hiddenFacetCount).toBe(1);

    const list2 = await ctx.get(`/api/novels/${slug}/wiki`);
    const listBody2 = (await list2.json()) as { items: { entryKey: string; imageUrl?: string }[] };
    const portraitList2 = listBody2.items.find(item => item.entryKey === 'gated-portrait');
    expect(portraitList2?.imageUrl, 'the list falls back to the reached gallery image while the headline stays gated').toContain(galleryRef);

    const portraitDetail2 = await ctx.get(`/api/novels/${slug}/wiki/gated-portrait`);
    const portraitDetailBody2 = (await portraitDetail2.json()) as Record<string, unknown>;
    expect(Object.hasOwn(portraitDetailBody2, 'imageUrl'), 'the entry page never falls back to the gallery for its own headline').toBe(false);

    // Positive control: advancing the gate to the headline's own reveal ordinal unlocks the late facet and the portrait together.
    await setFurthestOrdinal(novel, reader.user.userId, 5);
    const facetAt5 = await ctx.get(`/api/novels/${slug}/wiki/partial-reveal`);
    const facetBody5 = (await facetAt5.json()) as { facets: { facetKey: string }[]; hiddenFacetCount: number };
    expect(facetBody5.facets.map(f => f.facetKey).sort()).toEqual(['facet-early', 'facet-late']);
    expect(facetBody5.hiddenFacetCount).toBe(0);

    const portraitDetail5 = await ctx.get(`/api/novels/${slug}/wiki/gated-portrait`);
    const portraitDetailBody5 = (await portraitDetail5.json()) as { imageUrl?: string };
    expect(portraitDetailBody5.imageUrl).toContain(headlineRef);

    const list5 = await ctx.get(`/api/novels/${slug}/wiki`);
    const listBody5 = (await list5.json()) as { items: { entryKey: string; imageUrl?: string }[] };
    const portraitList5 = listBody5.items.find(item => item.entryKey === 'gated-portrait');
    expect(portraitList5?.imageUrl).toContain(headlineRef);
  });
});

/**
 * The wiki's own caching contract, independent of the novel/chapter routes': CDN-cacheable with a revalidating
 * ETag for an anonymous read of a public novel, and `private, no-store` + `Vary` the moment the read becomes
 * reader-specific — `WikiController.applyCachePolicy`'s `personalized` branch fires even for a PUBLIC novel, since
 * a signed-in reader's gate makes the response a function of who's asking.
 */
test.describe('wiki caching contract', () => {
  const slugs: string[] = [];

  test.afterEach(async () => {
    await deleteNovels(slugs.splice(0));
  });

  test('should mark an anonymous public wiki read CDN-cacheable with a matching-ETag 304, and a signed-in read private, no-store', async ({ webNovel }) => {
    const slug = uniqueNovelSlug('wiki-cache');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'PUBLIC', chapters: 1 });
    await arrangeWikiEntry(novel, { entryKey: 'entry', firstVisibleOrdinal: 0 });

    const guest = await webNovel.guest();
    const first = await guest.get(`/api/novels/${slug}/wiki`);
    expect(first.status()).toBe(200);
    const cacheControl = first.headers()['cache-control'] ?? '';
    expect(cacheControl).toContain('public');
    expect(cacheControl).toContain('max-age');
    const etag = first.headers()['etag'];
    expect(etag).toBeTruthy();

    const revalidated = await guest.get(`/api/novels/${slug}/wiki`, { headers: { 'if-none-match': etag as string } });
    expect(revalidated.status()).toBe(304);

    const { ctx } = await webNovel.signIn(await webNovel.reader('wiki-cache-reader'));
    const personalized = await ctx.get(`/api/novels/${slug}/wiki`);
    expect(personalized.status()).toBe(200);
    const personalizedCacheControl = personalized.headers()['cache-control'] ?? '';
    expect(personalizedCacheControl).toContain('private');
    expect(personalizedCacheControl).toContain('no-store');
    const vary = personalized.headers()['vary'] ?? '';
    expect(vary).toContain('Cookie');
    expect(vary).toContain('Authorization');
  });
});

/**
 * The wiki route runs its own access check rather than trusting an upstream one: a RESTRICTED novel's wiki (list
 * and per-entry) must 404 with the same `WBN_001` the novel/chapter routes give, for both a guest and an
 * ungranted reader, and a grant must unlock it — proving `WikiService.listEntries`/`getEntry` call
 * `catalogService.getReadableNovel` themselves.
 */
test.describe('wiki restricted-novel gate', () => {
  const slugs: string[] = [];

  test.afterEach(async () => {
    await deleteNovels(slugs.splice(0));
  });

  test('should 404 WBN_001 for the wiki of a restricted novel without a grant, and unlock it once granted', async ({ webNovel }) => {
    const slug = uniqueNovelSlug('wiki-restricted');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'RESTRICTED', chapters: 1 });
    await arrangeWikiEntry(novel, { entryKey: 'entry', firstVisibleOrdinal: 0 });

    const guest = await webNovel.guest();
    const guestList = await guest.get(`/api/novels/${slug}/wiki`);
    expect(guestList.status()).toBe(404);
    expect(((await guestList.json()) as { code?: string }).code).toBe('WBN_001');
    const guestEntry = await guest.get(`/api/novels/${slug}/wiki/entry`);
    expect(guestEntry.status()).toBe(404);
    expect(((await guestEntry.json()) as { code?: string }).code).toBe('WBN_001');

    // Enumeration safety: a real novel the guest can't read must be byte-identical to one that doesn't exist at all, on both wiki routes — not just same-code.
    const [restrictedList, unknownList] = await Promise.all([guest.get(`/api/novels/${slug}/wiki`), guest.get(`/api/novels/${UNKNOWN_SLUG}/wiki`)]);
    expect(restrictedList.status()).toBe(404);
    expect(unknownList.status()).toBe(404);
    expect(await restrictedList.text()).toBe(await unknownList.text());
    const [restrictedEntry, unknownEntry] = await Promise.all([guest.get(`/api/novels/${slug}/wiki/entry`), guest.get(`/api/novels/${UNKNOWN_SLUG}/wiki/entry`)]);
    expect(restrictedEntry.status()).toBe(404);
    expect(unknownEntry.status()).toBe(404);
    expect(await restrictedEntry.text()).toBe(await unknownEntry.text());

    const probe = await webNovel.reader('wiki-restricted-probe');
    const { ctx: probeCtx } = await webNovel.signIn(probe);
    const probeList = await probeCtx.get(`/api/novels/${slug}/wiki`);
    expect(probeList.status()).toBe(404);
    expect(((await probeList.json()) as { code?: string }).code).toBe('WBN_001');
    const probeEntry = await probeCtx.get(`/api/novels/${slug}/wiki/entry`);
    expect(probeEntry.status()).toBe(404);
    expect(((await probeEntry.json()) as { code?: string }).code).toBe('WBN_001');

    // Positive control: granting access unlocks both the wiki list and the entry.
    const granted = await webNovel.reader('wiki-restricted-granted');
    await grantNovel(novel, granted.user.userId);
    const { ctx: grantedCtx } = await webNovel.signIn(granted);
    const grantedList = await grantedCtx.get(`/api/novels/${slug}/wiki`);
    expect(grantedList.status()).toBe(200);
    const grantedEntry = await grantedCtx.get(`/api/novels/${slug}/wiki/entry`);
    expect(grantedEntry.status()).toBe(200);
  });
});
