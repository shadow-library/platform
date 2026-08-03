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
