/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, readSeedManifest } from '../../lib';
import { arrangeNovel, deleteNovels, uniqueNovelSlug, updateServedChapter } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Request-level coverage of `apps/web-novel-server`'s public catalog/chapter API, as a guest (no session unless
 * a test says otherwise). The public catalog projection is PUBLIC-visibility-only unconditionally — the seeded
 * `e2e-restricted-novel` must never appear in it regardless of caller — and a handful of validation rules on
 * `GET /api/novels` are enforced server-side even though `apps/web-novel-web`'s own Browse screen never sends
 * the values that would trip them (see the web-novel report: several Browse filters are client-only).
 */
test.describe('catalog api', () => {
  const { webNovel } = readSeedManifest();

  test('should list the seeded public novel and never the restricted one', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get('/api/novels?limit=100');
    expect(response.status()).toBe(200);

    const body = (await response.json()) as { items: { slug: string }[] };
    const slugs = body.items.map(item => item.slug);
    expect(slugs, 'expected the seeded public novel in the guest catalog').toContain(webNovel.publicSlug);
    expect(slugs, 'a RESTRICTED novel must never surface in the public catalog').not.toContain(webNovel.restrictedSlug);
  });

  test('should paginate with limit=1', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get('/api/novels?limit=1');
    expect(response.status()).toBe(200);

    const body = (await response.json()) as { total: number; items: unknown[] };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items).toHaveLength(1);
  });

  test('should sort by title ascending', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get('/api/novels?sortBy=title&sortOrder=asc&limit=100');
    expect(response.status()).toBe(200);

    const body = (await response.json()) as { items: { title: string }[] };
    const titles = body.items.map(item => item.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sorted);
  });

  /**
   * APP BUG (suspected) — `NovelCatalogQuery` (`apps/web-novel-server/src/modules/catalog/catalog.dto.ts:27`)
   * extends the shared `PaginationQuery` (`packages/modules/src/http-core/dtos/pagination.dto.ts:64-74`), whose
   * `@Field` decorators declare `limit: {minimum: 1, maximum: 100}`, `offset: {minimum: 0}`, and a `sortBy` enum
   * restricted to `NOVEL_SORT_FIELDS`. `@Params()` on the same controller family enforces its schema correctly
   * (a malformed slug 422s below), but `@Query() query: NovelCatalogQuery` on `GET /api/novels`
   * (`catalog.controller.ts:40-42`) does not: every value tried here — `limit=0`, `limit=101`, `limit=-5`,
   * `limit=abc` (not even numeric), `offset=-1`, `sortBy=bogus` — comes back `200` with the *declared default*
   * silently substituted (`limit:20, offset:0`), never a validation error. Confirmed live against the deployed
   * cluster with direct `curl`, not just through this harness. Suspected file: whatever query-string binding
   * `@shadow-library/class-schema`'s HTTP adapter uses for `@Query()` — it isn't running the same validator
   * `@Params()` goes through. Filed as `test.fixme()` rather than asserted as passing, since silently
   * discarding invalid pagination input is a real behavior difference from the schema's own declared contract,
   * not a test-authoring mistake.
   */
  const invalidQueries: { name: string; query: string }[] = [
    { name: 'limit=0', query: '?limit=0' },
    { name: 'limit=101', query: '?limit=101' },
    { name: 'offset=-1', query: '?offset=-1' },
    { name: 'sortBy=bogus', query: '?sortBy=bogus' },
  ];
  for (const { name, query } of invalidQueries) {
    test.fixme(`should 400 on ${name}`, async () => {
      const ctx = await apiContext('webNovel');
      const response = await ctx.get(`/api/novels${query}`);
      expect(response.status()).toBe(400);
    });
  }

  /**
   * Unlike the query-param cases above, `@Params()` path validation on `NovelSlugParams` is enforced — but the
   * status is `422 Unprocessable Entity` with `{code:"VALIDATION_ERROR", fields:[...]}`, not the `400` the
   * web-novel report anticipated. Confirmed live: `curl .../api/novels/BAD_SLUG!` → `422`. Asserting the real
   * status/shape here (not a bug — 422 is the platform's actual, consistent validation-error status).
   */
  test('should 422 with VALIDATION_ERROR on a slug containing characters outside the allowed pattern', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get('/api/novels/BAD_SLUG!');
    expect(response.status()).toBe(422);

    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('should 404 with WBN_001 for a well-formed but unknown slug', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get('/api/novels/e2e-does-not-exist');
    expect(response.status()).toBe(404);

    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('WBN_001');
  });

  test('should 404 with WBN_002 for an unknown chapter ordinal', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get(`/api/novels/${webNovel.publicSlug}/chapters/9999`);
    expect(response.status()).toBe(404);

    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('WBN_002');
  });

  /**
   * `ETag`/`If-None-Match` on a chapter GET is a real conditional-request contract, not decoration — a reader
   * client is expected to skip re-downloading unchanged chapter text. Fetch once to capture the `ETag`, then
   * echo it back and expect a bodyless `304`.
   */
  test('should return a 304 when re-requesting a chapter with its own ETag', async () => {
    const ctx = await apiContext('webNovel');
    const first = await ctx.get(`/api/novels/${webNovel.publicSlug}/chapters/1`);
    expect(first.status()).toBe(200);
    const etag = first.headers()['etag'];
    expect(etag, 'expected the chapter response to carry an ETag').toBeTruthy();

    const second = await ctx.get(`/api/novels/${webNovel.publicSlug}/chapters/1`, { headers: { 'if-none-match': etag as string } });
    expect(second.status()).toBe(304);
  });

  /**
   * The public detail response is safe to share a CDN/browser cache — `cache-control: public, max-age=300` — but
   * only for a caller who could see it as a guest. An authenticated caller (`user1`, no special relationship to
   * this PUBLIC novel) still gets a cacheable response per-novel-visibility, not per-caller, per the report's
   * "PUBLIC → public, max-age=300; else private, no-store" rule read literally against visibility, not auth state.
   * What must differ for an authenticated caller is that a *private* resource never lands in a shared cache — that
   * is exercised by the restricted-novel case in `visibility.spec.ts`, which is genuinely per-caller.
   */
  test('should mark the public novel detail response cacheable for a guest', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get(`/api/novels/${webNovel.publicSlug}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control'] ?? '').toContain('public');
    expect(response.headers()['cache-control'] ?? '').toContain('max-age');
  });

  /**
   * The contrast case: any authenticated, per-caller endpoint must never be marked shared-cacheable, however
   * cacheable the anonymous catalog is. `GET /api/library` sets `cache-control: private, no-store` explicitly
   * (`reader.controller.ts:106-109`) — a stray `public`/`max-age` here would risk one user's library leaking
   * into a shared cache.
   */
  test('should mark an authenticated per-caller response private, no-store', async () => {
    const ctx = await apiContext('webNovel', 'user1');
    const response = await ctx.get('/api/library');
    expect(response.status()).toBe(200);
    const cacheControl = response.headers()['cache-control'] ?? '';
    expect(cacheControl).toContain('private');
    expect(cacheControl).toContain('no-store');
  });
});

/**
 * `GET /api/novels` filter/search/pagination/serialization behavior, arranged straight into the catalog table
 * rather than through a publisher. The catalog is public and shared with every other lane and ~19 pre-existing
 * orphan e2e novels, so every query here is additionally scoped by `search=marker` — a token unique to this
 * describe's own four rows, embedded in an otherwise fixed-case substring of the title (also the vehicle for the
 * case-insensitive search assertion) — so a concurrent lane's rows can never leak into an assertion here.
 */
test.describe('catalog filters, search and serialization', () => {
  const marker = randomBytes(4).toString('hex');
  const search = `catalog-${marker}`;
  const slugs = {
    alpha: uniqueNovelSlug('cat-alpha'),
    beta: uniqueNovelSlug('cat-beta'),
    gamma: uniqueNovelSlug('cat-gamma'),
    delta: uniqueNovelSlug('cat-delta'),
  };

  test.beforeAll(async () => {
    // alpha: fully rated, one chapter with genre/tag matches. beta: rated but a different genre/tag, high violence.
    // gamma: entirely unrated and retired — the "excluded under any ceiling, included with none" and status-filter control.
    // delta: same genre as alpha but rated past any sane ceiling — the rank-vs-alphabetical differentiator alongside beta.
    await arrangeNovel({
      slug: slugs.alpha,
      visibility: 'PUBLIC',
      chapters: 2,
      title: `E2E CATALOG-${marker} Alpha`,
      genres: ['Fantasy'],
      tags: ['Male Protagonist'],
      sexualContent: 'none',
      violence: 'mild',
      darkContent: 'none',
      status: 'live',
    });
    await arrangeNovel({
      slug: slugs.beta,
      visibility: 'PUBLIC',
      chapters: 1,
      title: `E2E CATALOG-${marker} Beta`,
      genres: ['Horror'],
      violence: 'graphic',
      darkContent: 'heavy',
      status: 'live',
    });
    await arrangeNovel({ slug: slugs.gamma, visibility: 'PUBLIC', chapters: 1, title: `E2E CATALOG-${marker} Gamma`, status: 'retired' });
    await arrangeNovel({
      slug: slugs.delta,
      visibility: 'PUBLIC',
      chapters: 1,
      title: `E2E CATALOG-${marker} Delta`,
      genres: ['Fantasy'],
      violence: 'extreme',
      status: 'live',
    });
  });

  test.afterAll(async () => {
    await deleteNovels(Object.values(slugs));
  });

  test('should case-insensitively match the title search', async () => {
    const ctx = await apiContext('webNovel');
    // `search` is already the lowercase form of the "CATALOG-" the titles were seeded with — a case mismatch the ilike must tolerate.
    const response = await ctx.get(`/api/novels?search=${search}&limit=100`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { items: { slug: string }[] };
    expect(body.items.map(item => item.slug).sort()).toEqual(Object.values(slugs).sort());
  });

  test('should filter by genre and 422 VALIDATION_ERROR on an unrecognised genre', async () => {
    const ctx = await apiContext('webNovel');
    const matched = await ctx.get(`/api/novels?search=${search}&genre=Fantasy&limit=100`);
    expect(matched.status()).toBe(200);
    const matchedBody = (await matched.json()) as { items: { slug: string }[] };
    expect(matchedBody.items.map(item => item.slug).sort()).toEqual([slugs.alpha, slugs.delta].sort());

    const rejected = await ctx.get(`/api/novels?search=${search}&genre=NotAGenre`);
    expect(rejected.status()).toBe(422);
    expect(((await rejected.json()) as { code?: string }).code).toBe('VALIDATION_ERROR');
  });

  test('should filter by tag and 422 VALIDATION_ERROR on an unrecognised tag', async () => {
    const ctx = await apiContext('webNovel');
    const matched = await ctx.get(`/api/novels?search=${search}&tag=${encodeURIComponent('Male Protagonist')}&limit=100`);
    expect(matched.status()).toBe(200);
    const matchedBody = (await matched.json()) as { items: { slug: string }[] };
    expect(matchedBody.items.map(item => item.slug)).toEqual([slugs.alpha]);

    const rejected = await ctx.get(`/api/novels?search=${search}&tag=NotATag`);
    expect(rejected.status()).toBe(422);
    expect(((await rejected.json()) as { code?: string }).code).toBe('VALIDATION_ERROR');
  });

  /**
   * The differentiator between a rank-based ceiling and a naive alphabetical one: `violence` is stored as
   * `['none','mild','graphic','extreme']` in rank order, but alphabetically `'extreme' < 'graphic' < 'mild'`, so
   * a string comparison against a `mild` ceiling would wrongly admit both `beta` (`graphic`) and `delta`
   * (`extreme`) — either leaking in here would mean the server compared level names as strings, not ranks.
   */
  test('should apply the violence ceiling by rank, not alphabetically, and exclude the unrated row', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get(`/api/novels?search=${search}&maxViolence=mild&limit=100`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { items: { slug: string }[] };
    expect(body.items.map(item => item.slug)).toEqual([slugs.alpha]);
  });

  test('should exclude the unrated novel under any ceiling, however loose, while it stays included with no rating filter', async () => {
    const ctx = await apiContext('webNovel');
    // gamma has no violence rating at all; even the loosest ceiling must exclude it rather than treat NULL as satisfying it.
    const response = await ctx.get(`/api/novels?search=${search}&maxViolence=extreme&limit=100`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { items: { slug: string }[] };
    expect(body.items.map(item => item.slug).sort()).toEqual([slugs.alpha, slugs.beta, slugs.delta].sort());
    expect(body.items.map(item => item.slug)).not.toContain(slugs.gamma);
  });

  const ratingBoundaryCases = [
    { name: 'maxSexualContent', query: 'maxSexualContent=not-a-level' },
    { name: 'maxViolence', query: 'maxViolence=not-a-level' },
    { name: 'maxDarkContent', query: 'maxDarkContent=not-a-level' },
  ] as const;
  for (const { name, query } of ratingBoundaryCases) {
    test(`should 422 VALIDATION_ERROR on an unrecognised ${name} level`, async () => {
      const ctx = await apiContext('webNovel');
      const response = await ctx.get(`/api/novels?search=${search}&${query}`);
      expect(response.status()).toBe(422);
      expect(((await response.json()) as { code?: string }).code).toBe('VALIDATION_ERROR');
    });
  }

  test('should filter by status', async () => {
    const ctx = await apiContext('webNovel');
    const retired = await ctx.get(`/api/novels?search=${search}&status=retired&limit=100`);
    const retiredBody = (await retired.json()) as { items: { slug: string }[] };
    expect(retiredBody.items.map(item => item.slug)).toEqual([slugs.gamma]);

    const live = await ctx.get(`/api/novels?search=${search}&status=live&limit=100`);
    const liveBody = (await live.json()) as { items: { slug: string }[] };
    expect(liveBody.items.map(item => item.slug).sort()).toEqual([slugs.alpha, slugs.beta, slugs.delta].sort());
  });

  test('should keep total stable across limit/offset pages with no overlap or gap', async () => {
    const ctx = await apiContext('webNovel');
    const first = await ctx.get(`/api/novels?search=${search}&sortBy=title&sortOrder=asc&limit=2&offset=0`);
    const firstBody = (await first.json()) as { total: number; items: { slug: string }[] };
    const second = await ctx.get(`/api/novels?search=${search}&sortBy=title&sortOrder=asc&limit=2&offset=2`);
    const secondBody = (await second.json()) as { total: number; items: { slug: string }[] };

    expect(firstBody.total).toBe(4);
    expect(secondBody.total).toBe(4);
    expect(firstBody.items).toHaveLength(2);
    expect(secondBody.items).toHaveLength(2);
    const combined = [...firstBody.items, ...secondBody.items].map(item => item.slug);
    expect(combined.sort()).toEqual(Object.values(slugs).sort());
  });

  test('should serialize tags/ratings for a rated novel and omit rating fields entirely (not "none") for an unrated one', async () => {
    const ctx = await apiContext('webNovel');
    const rated = await ctx.get(`/api/novels/${slugs.alpha}`);
    expect(rated.status()).toBe(200);
    const ratedBody = (await rated.json()) as { tags: string[]; sexualContent?: string; violence?: string; darkContent?: string };
    expect(ratedBody.tags).toEqual(['Male Protagonist']);
    expect(ratedBody.sexualContent).toBe('none');
    expect(ratedBody.violence).toBe('mild');
    expect(ratedBody.darkContent).toBe('none');

    const unrated = await ctx.get(`/api/novels/${slugs.gamma}`);
    expect(unrated.status()).toBe(200);
    const unratedBody = (await unrated.json()) as Record<string, unknown>;
    expect(Object.hasOwn(unratedBody, 'sexualContent'), 'unrated must omit the field, never send "none"').toBe(false);
    expect(Object.hasOwn(unratedBody, 'violence')).toBe(false);
    expect(Object.hasOwn(unratedBody, 'darkContent')).toBe(false);
  });

  test('should omit content from chapter metadata rows', async () => {
    const ctx = await apiContext('webNovel');
    const response = await ctx.get(`/api/novels/${slugs.alpha}/chapters`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { items: Record<string, unknown>[] };
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    for (const item of body.items) expect(Object.hasOwn(item, 'content')).toBe(false);
  });
});

/**
 * Chapter ETag/cache correctness beyond a single round-trip 304, each in its own novel so a republish in one
 * test can never be observed by another.
 */
test.describe('chapter etag/cache correctness beyond a single 304', () => {
  const slugs: string[] = [];

  test.afterEach(async () => {
    await deleteNovels(slugs.splice(0));
  });

  test('should treat a weak If-None-Match as matching', async () => {
    const slug = uniqueNovelSlug('cat-etag-weak');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'PUBLIC', chapters: 1 });
    const ctx = await apiContext('webNovel');

    const first = await ctx.get(`/api/novels/${novel.slug}/chapters/1`);
    expect(first.status()).toBe(200);
    const hash = (first.headers()['etag'] as string).replace(/^"|"$/g, '');

    const weak = await ctx.get(`/api/novels/${novel.slug}/chapters/1`, { headers: { 'if-none-match': `W/"${hash}"` } });
    expect(weak.status()).toBe(304);
  });

  test('should serve fresh content under a new ETag when a stale If-None-Match follows a republish', async () => {
    const slug = uniqueNovelSlug('cat-etag-stale');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'PUBLIC', chapters: 1 });
    const ctx = await apiContext('webNovel');

    const first = await ctx.get(`/api/novels/${novel.slug}/chapters/1`);
    expect(first.status()).toBe(200);
    const staleEtag = first.headers()['etag'] as string;
    const originalBody = (await first.json()) as { content: string };

    const newContent = 'Republished chapter content, revision bumped.';
    await updateServedChapter(novel.slug, 1, { content: newContent, contentHash: createHash('sha256').update(newContent).digest('hex'), revision: 2 });

    const second = await ctx.get(`/api/novels/${novel.slug}/chapters/1`, { headers: { 'if-none-match': staleEtag } });
    expect(second.status()).toBe(200);
    expect(second.headers()['etag']).not.toBe(staleEtag);
    const secondBody = (await second.json()) as { content: string };
    expect(secondBody.content).toBe(newContent);
    expect(secondBody.content).not.toBe(originalBody.content);
  });

  test('should never serve the previously cached body after a silent equal-revision content patch', async () => {
    const slug = uniqueNovelSlug('cat-etag-samerev');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'PUBLIC', chapters: 1 });
    const ctx = await apiContext('webNovel');

    const first = await ctx.get(`/api/novels/${novel.slug}/chapters/1`);
    expect(first.status()).toBe(200);
    const originalBody = (await first.json()) as { content: string; revision: number };

    const newContent = 'A silently patched chapter body, same revision.';
    // Revision is deliberately left unchanged — the cache key must still include the contentHash, or this GET would replay the cached body.
    await updateServedChapter(novel.slug, 1, { content: newContent, contentHash: createHash('sha256').update(newContent).digest('hex') });

    const second = await ctx.get(`/api/novels/${novel.slug}/chapters/1`);
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()) as { content: string; revision: number };
    expect(secondBody.revision).toBe(originalBody.revision);
    expect(secondBody.content).toBe(newContent);
    expect(secondBody.content).not.toBe(originalBody.content);
  });

  /**
   * Positive control for the two tests above, which only prove the cache never serves *stale* content — neither would fail if
   * `getChapterContent` had no cache at all. Force a state the real write path can never produce (content edited while revision
   * AND contentHash are both left untouched, so the LRU key `slug:ordinal:revision:contentHash` does not change) and confirm the
   * second GET still returns the *old* cached body — proof the LRU actually served from cache rather than re-reading the DB, which
   * is what the other two tests rely on to mean anything. web-novel-server runs a single replica in dev (confirmed via `kubectl get
   * deploy -n web-novel`), so this in-process LRU cannot be bypassed by the request landing on a different pod.
   */
  test('should serve the cached body when the cache key is unchanged, proving the LRU is actually live', async () => {
    const slug = uniqueNovelSlug('cat-etag-cache-hit');
    slugs.push(slug);
    const novel = await arrangeNovel({ slug, visibility: 'PUBLIC', chapters: 1 });
    const ctx = await apiContext('webNovel');

    const first = await ctx.get(`/api/novels/${novel.slug}/chapters/1`);
    expect(first.status()).toBe(200);
    const originalBody = (await first.json()) as { content: string };

    const driftedContent = 'Content changed behind the cache, key left untouched.';
    await updateServedChapter(novel.slug, 1, { content: driftedContent });

    const second = await ctx.get(`/api/novels/${novel.slug}/chapters/1`);
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()) as { content: string };
    expect(secondBody.content, 'an unchanged cache key must serve the cached body — if this is the drifted content, there is no live cache').toBe(originalBody.content);
    expect(secondBody.content).not.toBe(driftedContent);

    // Leave the row consistent again before cleanup.
    await updateServedChapter(novel.slug, 1, { contentHash: createHash('sha256').update(driftedContent).digest('hex') });
  });
});
