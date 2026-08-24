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

/**
 * Declaring the constants
 *
 * `user1` is left onboarded by `ensureOnboarded` regardless of whether an earlier spec/run already did it — the
 * account persists in the dev cluster across runs, so this makes the landing → Today assertion deterministic
 * whether this is the very first run or the hundredth.
 */
test.describe('shadow memoir auth', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should sign in through identity, land on Today, and keep the session across a reload', async ({ page }) => {
    const url = requireProductUrl('memoir');
    const ctx = await apiContext('memoir', 'user1');
    await ensureOnboarded(ctx);

    await page.goto(url);
    await expect(page).not.toHaveURL(/\/welcome/);
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    await page.reload();
    await expect(page).not.toHaveURL(/\/welcome/);
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  });
});
