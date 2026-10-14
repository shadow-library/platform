/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { requireProductUrl, storageStateFor } from '../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Web Novel is private, so its home route (`_shell/index.tsx`) renders only for a signed-in platform member; the anonymous
 * redirect is covered by `web-novel/private-access.spec.ts`. The page renders through the shared `Shell` component
 * (`packages/ui/src/components/Shell/Shell.tsx`), whose doc comment calls the `<main>` region mandatory: it always wraps the page
 * content, whether the catalog has rows or the empty state renders. That landmark is the one selector assumption this spec makes —
 * deliberately not asserting on specific catalog copy, which is free to change.
 */
test.describe('reader home', () => {
  test.use({ storageState: storageStateFor('viewer') });

  test('should render the reader home behind a main landmark for a signed-in reader', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main')).toBeVisible();
  });
});
