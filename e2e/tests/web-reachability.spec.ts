import { expect, test } from '@playwright/test';

import { getProductLabel, PRODUCTS, requireProductUrl } from '../lib';

/**
 * The baseline "does it load" check: follow redirects from the root and assert a genuine 2xx with a non-empty `<title>`. No body-text scanning for error copy,
 * which would false-positive on a fiction site's own content, so a failure means the deployment is broken rather than a screen's copy changed.
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
