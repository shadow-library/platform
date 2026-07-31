/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { requireProductUrl } from '../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Web Novel is the platform's public reader — its home route (`_shell/index.tsx`) needs no session and
 * renders through the shared `Shell` component (`packages/ui/src/components/Shell/Shell.tsx`), whose
 * doc comment calls the `<main>` region mandatory: it always wraps the page content, whether the catalog
 * has rows or the empty state renders. That landmark is the one selector assumption this spec makes —
 * deliberately not asserting on specific catalog copy, which is free to change.
 */
test.describe('public reading', () => {
  test('should render the reader home behind a main landmark', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main')).toBeVisible();
  });
});
