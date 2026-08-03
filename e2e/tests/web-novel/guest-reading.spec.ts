/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { readSeedManifest, requireProductUrl } from '../../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The unauthenticated reading path end to end: home → detail → reader, plus the catalog/search surface and the
 * two 404 boundaries (unknown slug, and a real-but-unreadable slug — which must present identically, per
 * `NovelAccessService`'s no-existence-oracle contract exercised at the API level in `visibility.spec.ts`). No
 * storage state is used anywhere in this file — every test here is the guest experience. Selectors favor
 * structural facts (an `<a href="/novels/$slug">` card link, landmark roles) over display copy, matching the
 * rest of this suite (`public-reading.spec.ts`, `ssr-hydration.spec.ts`).
 */
test.describe('guest reading', () => {
  const { webNovel } = readSeedManifest();

  test('should render the seeded public novel as a card on the home page', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href="/novels/${webNovel.publicSlug}"]`).first()).toBeVisible();
  });

  test('should show the title and all three seeded chapters on the novel detail page', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(`${url}/novels/${webNovel.publicSlug}`, { waitUntil: 'load' });

    await expect(page.getByRole('heading', { name: 'The E2E Public Chronicle' })).toBeVisible();

    // The tab trigger is real (SSR-rendered) markup before React hydrates, so a click that lands before
    // hydration finishes is observed to focus the "Chapters" tab without ever firing its `onValueChange` —
    // the tabpanel stays on "Overview" even though the tab itself shows focused/active. Waiting for
    // `networkidle` (the point the client has fetched its hydration bundle and settled) before interacting
    // avoids that race; `ssr-hydration.spec.ts` in this suite uses the same signal for the same reason.
    await page.waitForLoadState('networkidle');

    // The chapter list lives in the "Chapters" panel of the `Tabs.List aria-label="Novel sections"` widget
    // (`novel-screen.tsx:246-249`) — it isn't in the DOM until that tab is selected, unlike Overview which is
    // the default panel. (There's also an always-present "Start reading" CTA whose href happens to match
    // chapter 1's, so this checks each exact ordinal href rather than counting prefix matches.)
    await page.getByRole('tab', { name: 'Chapters' }).click();
    for (const ordinal of [1, 2, 3]) await expect(page.locator(`a[href="/read/${webNovel.publicSlug}/${ordinal}"]`).first()).toBeVisible();
  });

  test('should read chapter 1 and navigate to chapter 2', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(`${url}/read/${webNovel.publicSlug}/1`, { waitUntil: 'domcontentloaded' });

    // Chapter content is seeded distinctly per ordinal (`seed.ts`'s `upsertChapter`) — the numeral is enough to
    // prove chapter 1's own body rendered, without depending on its full sentence. Waiting on it first also
    // ensures the reader's bottom chrome (which only renders once `chapter.data` resolves — `reader-screen.tsx:359`)
    // has mounted before the next click.
    await expect(page.getByText('Chapter 1 of the seeded novel', { exact: false })).toBeVisible();

    // "Next chapter" is a `<button>` (`reader-screen.tsx:373-381`), not a link — it drives client-side
    // navigation via `goTo`, not an anchor `href`.
    await page.getByRole('button', { name: 'Next chapter' }).click();
    await expect(page).toHaveURL(new RegExp(`/read/${webNovel.publicSlug}/2$`));
    await expect(page.getByText('Chapter 2 of the seeded novel', { exact: false })).toBeVisible();
  });

  test('should list the public novel and find it by search on /browse', async ({ page }) => {
    const url = requireProductUrl('webNovel');

    await page.goto(`${url}/browse`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href="/novels/${webNovel.publicSlug}"]`).first()).toBeVisible();

    // Driving search through the URL (the same `search` query param `GET /api/novels` accepts) is a structural
    // assertion — it proves the catalog's search filter actually narrows results, without coupling to whichever
    // element the search box happens to be this release.
    await page.goto(`${url}/browse?search=${encodeURIComponent('E2E Public Chronicle')}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href="/novels/${webNovel.publicSlug}"]`).first()).toBeVisible();
  });

  test('should never surface the restricted novel in the catalog or on home', async ({ page }) => {
    const url = requireProductUrl('webNovel');

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href="/novels/${webNovel.restrictedSlug}"]`)).toHaveCount(0);

    await page.goto(`${url}/browse`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href="/novels/${webNovel.restrictedSlug}"]`)).toHaveCount(0);
  });

  /**
   * APP BUG (suspected) — `/novels/$slug`'s loader (`apps/web-novel-web/src/routes/_shell/novels.$slug.tsx:20`)
   * calls `context.queryClient.ensureQueryData(novelQueryOptions(params.slug))` and never calls TanStack
   * Router's `notFound()`. When the API 404s (WBN_001, confirmed correct at the API level — see
   * `visibility.spec.ts`), `novelQueryOptions` throws a plain `ApiError`, which the router routes to
   * `DefaultCatchBoundary` (`apps/web-novel-web/src/components/DefaultCatchBoundary.tsx`) rather than the
   * `NotFound` component (`apps/web-novel-web/src/components/NotFound.tsx`) — and, confirmed live via `curl`,
   * the outer HTTP response is `500`, not `404`. Expected per this suite's brief: a 404 boundary, not a
   * generic error page. Actual: a `500` "Something went wrong" catch-boundary page with the raw API message
   * ("Novel not found") as body text — which, for the restricted-novel case, also happens to leak that the
   * slug corresponds to *something* (an error distinguishable from a route that never matched), undermining
   * the enumeration-safety property `visibility.spec.ts` confirms holds at the API layer.
   */
  test.fixme('should render the 404 boundary (not a forbidden page) for the restricted novel as a guest', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    const response = await page.goto(`${url}/novels/${webNovel.restrictedSlug}`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(404);
  });

  test.fixme('should render the 404 boundary for an unknown slug', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    const response = await page.goto(`${url}/novels/e2e-does-not-exist`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(404);
  });
});
