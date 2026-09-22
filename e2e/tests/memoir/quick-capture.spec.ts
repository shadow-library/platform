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

test.describe('memoir quick capture', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should log an expense through the command palette and show it on the Finance screen', async ({ page }) => {
    const url = requireProductUrl('memoir');
    await ensureOnboarded(await apiContext('memoir', 'user1'));

    await page.goto(url);
    // The ⌘K listener is registered by a shell effect after hydration, and `page.goto` only waits for `load`, so an early
    // shortcut can land before anything listens. The SSR markup is no hydration signal, so re-send the shortcut until the
    // palette opens — and only while it is still closed, since a second press would toggle it shut.
    const captureInput = page.getByLabel('Log something, or jump to a screen');
    await expect(async () => {
      if (!(await captureInput.isVisible())) await page.keyboard.press('ControlOrMeta+KeyK');
      await expect(captureInput).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

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

    // The saved entry legitimately renders twice — the list row and a preview excerpt elsewhere on the
    // page — so an unscoped text match is ambiguous under strict mode; `.first()` just needs any instance.
    await expect(page.getByText(entryText).first()).toBeVisible();
  });
});
