import { expect, test } from '@playwright/test';

import { apiContext, requireProductUrl, storageStateFor } from '../../lib';
import { ensureOnboarded } from './helpers';

/** `user1` is left onboarded by `ensureOnboarded` whether or not an earlier run did it (the account persists across runs), so the landing -> Today assertion is deterministic. */
test.describe('memoir auth', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should sign in through identity, land on Today, and keep the session across a reload', async ({ page }) => {
    const url = requireProductUrl('memoir');
    const ctx = await apiContext('memoir', 'user1');
    await ensureOnboarded(ctx);

    await page.goto(url);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    await page.reload();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  });
});
