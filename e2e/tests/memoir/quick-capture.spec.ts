/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, requireProductUrl, storageStateFor } from '../../lib';
import { ensureOnboarded } from './helpers';

/**
 * Defining types
 */

test.describe('shadow memoir quick capture', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should log an expense through the command palette and show it on the Finance screen', async ({ page }) => {
    const url = requireProductUrl('memoir');
    await ensureOnboarded(await apiContext('memoir', 'user1'));

    await page.goto(url);
    // The ⌘K listener is registered by a shell effect after hydration; `page.goto` only waits for `load`, so
    // sending the shortcut immediately can fire before anything is listening. Wait for the banner's own quick
    // capture trigger (same component tree, same mount) to confirm the shell has hydrated before sending it.
    await expect(page.getByRole('button', { name: 'Quick capture' })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+KeyK');

    const captureInput = page.getByLabel('Log something, or jump to a screen');
    await expect(captureInput).toBeVisible();

    const note = `e2e coffee ${Date.now()}`;
    await captureInput.fill(`${note} 3.50`);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(captureInput).toBeHidden();

    await page.goto(`${url}/finance`);
    await expect(page.getByText(note)).toBeVisible();
  });

  test('should save a journal entry from /log and show it in the entry list', async ({ page }) => {
    const url = requireProductUrl('memoir');
    await ensureOnboarded(await apiContext('memoir', 'user1'));

    await page.goto(`${url}/log`);
    await expect(page.getByRole('heading', { name: 'Journal', level: 2 })).toBeVisible();

    const entryText = `E2E journal entry ${Date.now()}`;
    await page.getByPlaceholder('Write as much or as little as you like. One line counts.').fill(entryText);
    await page.getByRole('button', { name: 'Save entry' }).click();

    await expect(page.getByText(entryText)).toBeVisible();
  });
});
