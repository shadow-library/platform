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
 * The baseline "does it load" check for every configured product: navigate to the root, follow any
 * redirects (identity and novel-forge both 307 unauthenticated visitors onward server-side — see
 * `auth-gate.spec.ts`), and assert the page that's actually left on screen is a genuine 2xx response with
 * a real rendered document (non-empty `<title>`). Deliberately just that — no body-text scanning for
 * "error-page" copy, which risks a false positive against a fiction-reading site's own content — so a
 * failure here means "the deployment is broken", not "this one screen's copy changed".
 */
test.describe('web reachability', () => {
  for (const product of PRODUCTS) {
    test(`should render a live page for ${getProductLabel(product)}`, async ({ page }) => {
      const url = requireProductUrl(product);

      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      expect(response, `no navigation response from ${url}`).not.toBeNull();
      expect(response!.status(), `expected a 2xx final response from ${url}, got ${response!.status()}`).toBeGreaterThanOrEqual(200);
      expect(response!.status(), `expected a 2xx final response from ${url}, got ${response!.status()}`).toBeLessThan(300);

      const title = (await page.title()).trim();
      expect(title.length, `expected a non-empty <title> at ${url}`).toBeGreaterThan(0);
    });
  }
});
