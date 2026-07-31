/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { getProductLabel, PRODUCTS, requireProductUrl } from '../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Copy a browser only shows on a genuine crash/interstitial — Chrome's own network-error page, a
 * framework 500 page — never on a normal app screen. A false positive here would need an app to
 * literally put this text in its UI, which none of the four do.
 */
const ERROR_PAGE_MARKERS = [
  /this site can.t be reached/i,
  /err_connection/i,
  /err_name_not_resolved/i,
  /err_ssl/i,
  /internal server error/i,
  /application error/i,
  /something went wrong/i,
];

/**
 * The baseline "is it even up" check for every configured product: a 200-family response, a real
 * rendered document (non-empty `<title>`), and no browser/framework crash interstitial. Deliberately
 * dumber than `auth-gate` or `public-reading` — it fails for reasons unrelated to app-specific markup, so
 * it isolates "the deployment is broken" from "this one screen changed".
 */
test.describe('web reachability', () => {
  for (const product of PRODUCTS) {
    test(`should render a live page for ${getProductLabel(product)}`, async ({ page }) => {
      const url = requireProductUrl(product);

      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      expect(response, `no navigation response from ${url}`).not.toBeNull();
      expect(response!.status(), `unexpected status from ${url}`).toBeGreaterThanOrEqual(200);
      expect(response!.status(), `unexpected status from ${url}`).toBeLessThan(400);

      const title = (await page.title()).trim();
      expect(title.length, `expected a non-empty <title> at ${url}`).toBeGreaterThan(0);

      const bodyText = (await page.locator('body').innerText()).slice(0, 2000);
      for (const marker of ERROR_PAGE_MARKERS) expect(bodyText, `looks like an error page at ${url}`).not.toMatch(marker);
    });
  }
});
