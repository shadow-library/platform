import { expect, test } from '@playwright/test';

import { requireProductUrl, storageStateFor } from '../lib';

/**
 * Web Novel is private, so its home renders only for a signed-in platform member (the anonymous redirect is in `web-novel/private-access.spec.ts`). The shared `Shell`
 * always wraps the page in `<main>`, with or without catalog rows; that landmark is the one selector assumed, so catalog copy stays free to change.
 */
test.describe('reader home', () => {
  test.use({ storageState: storageStateFor('viewer') });

  test('should render the reader home behind a main landmark for a signed-in reader', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main')).toBeVisible();
  });
});
