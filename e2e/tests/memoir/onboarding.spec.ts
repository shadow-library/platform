/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, requireProductUrl, storageStateFor } from '../../lib';
import { getAccount } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Drives the real five-step onboarding wizard (`features/onboarding`) as `user2` — the one persona
 * `seed/seed.ts` wipes from the memoir database on every run (`cleanMemoir`), so this always finds an
 * unprovisioned, never-onboarded account regardless of how many times the suite has run against this
 * cluster before. `user1` is deliberately left alone for the other specs, which want a persistent,
 * already-onboarded account.
 */
test.describe('shadow memoir onboarding', () => {
  test.use({ storageState: storageStateFor('user2') });

  test('should walk a fresh account through onboarding, lock the currency, and land a first quest on Today', async ({ page }) => {
    const url = requireProductUrl('memoir');

    await page.goto(`${url}/onboarding`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Step 1 — essentials: wake/sleep window, timezone, home currency.
    await page.getByLabel('Wake time').fill('07:00');
    await page.getByLabel('Sleep time').fill('23:00');
    await page.getByLabel('Timezone').click();
    await page.getByRole('option', { name: 'Europe/London' }).click();
    await page.getByLabel('Home currency').click();
    await page.getByRole('option', { name: 'USD $' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2 — first quest: use the offered example rather than free text, then pick a stat affinity.
    const questName = 'Read 10 pages';
    await page.getByRole('button', { name: questName }).click();
    await page.getByRole('group', { name: 'Stat' }).getByRole('button', { name: 'Mind' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3 — recurrence.
    await page.getByRole('button', { name: 'Every day' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4 — strictness.
    await page.getByRole('group', { name: 'Strictness' }).getByRole('button', { name: 'Routine' }).click();
    await page.getByRole('button', { name: 'Review' }).click();

    // Step 5 — review, then commit.
    await page.getByRole('button', { name: 'Create it and start' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: `Mark complete: ${questName}` })).toBeVisible();

    const ctx = await apiContext('memoir', 'user2');
    const account = await getAccount(ctx);
    expect(account.onboardingCompletedAt).not.toBeNull();
    expect(account.defaultCurrency).toBe('USD');
  });
});
