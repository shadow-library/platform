import { expect, test } from '@playwright/test';

import { readSeedManifest, requireProductUrl, storageStateFor } from '../../lib';

/**
 * The reading path for a signed-in reader with no grants (as `viewer`; anonymous never gets past the login redirect): home -> detail -> reader, catalog/search, and the two 404
 * boundaries (unknown slug, real-but-unreadable slug), which must present identically (`NovelAccessService`'s no-existence-oracle contract, see `visibility.spec.ts`).
 * Opening a chapter records progress for the viewer, so no spec may assume it has none; the seed clears it every run. Selectors favor structural facts over display copy.
 */
test.describe('viewer reading', () => {
  test.use({ storageState: storageStateFor('viewer') });

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

    // The tab trigger is SSR markup before hydration: a click before it finishes focuses "Chapters" without firing `onValueChange`, leaving the tabpanel on "Overview".
    // `networkidle` avoids the race.
    await page.waitForLoadState('networkidle');

    // The chapter list is not in the DOM until the "Chapters" tab is selected. An always-present "Start reading" CTA matches chapter 1's href, so each exact ordinal href is
    // checked, not prefix matches.
    await page.getByRole('tab', { name: 'Chapters' }).click();
    for (const ordinal of [1, 2, 3]) await expect(page.locator(`a[href="/read/${webNovel.publicSlug}/${ordinal}"]`).first()).toBeVisible();
  });

  test('should read chapter 1 and navigate to chapter 2', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(`${url}/read/${webNovel.publicSlug}/1`, { waitUntil: 'domcontentloaded' });

    // Chapter content is seeded distinctly per ordinal, so the numeral proves the body rendered; waiting on it also ensures the bottom chrome (rendered once `chapter.data`
    // resolves) has mounted.
    await expect(page.getByText('Chapter 1 of the seeded novel', { exact: false })).toBeVisible();

    // "Next chapter" is a `<button>` driving client-side navigation via `goTo`, not an anchor.
    await page.getByRole('button', { name: 'Next chapter' }).click();
    await expect(page).toHaveURL(new RegExp(`/read/${webNovel.publicSlug}/2$`));
    await expect(page.getByText('Chapter 2 of the seeded novel', { exact: false })).toBeVisible();
  });

  test('should list the public novel and find it by search on /browse', async ({ page }) => {
    const url = requireProductUrl('webNovel');

    await page.goto(`${url}/browse`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href="/novels/${webNovel.publicSlug}"]`).first()).toBeVisible();

    // Driving search through the `search` query param is structural: it proves the filter narrows results without coupling to the search box element.
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

  /** A novel the reader may not see is answered exactly like a missing one: the route's own 404 boundary, never an error page that tells them apart. */
  for (const [label, slug] of [
    ['the restricted novel', webNovel.restrictedSlug],
    ['an unknown slug', 'e2e-does-not-exist'],
  ] as const) {
    test(`should render the 404 boundary for ${label} as a viewer`, async ({ page }) => {
      const url = requireProductUrl('webNovel');
      const response = await page.goto(`${url}/novels/${slug}`, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { name: 'Lost in the shadows' })).toBeVisible();
      await expect(page.getByText('Novel not found'), 'the API message never reaches the page').toHaveCount(0);
    });
  }
});
