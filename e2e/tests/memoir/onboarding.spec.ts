import { expect, request, test } from '@playwright/test';

import { addIdentitySessionCookies, createIdentitySession, createIdentityUser, deleteIdentityUser, type IdentityUser, memoirDb, requireProductUrl } from '../../lib';
import { getAccount } from './helpers';

/**
 * Drives the real five-step onboarding wizard as a throwaway identity user. Wiping a persona's memoir account instead fails: memoir-server caches sub -> account id for
 * `account.context-ttl` (60 s) and answers a vanished row with ACC_002 until it expires.
 */
test.describe('memoir onboarding', () => {
  let user: IdentityUser | undefined;

  test.afterEach(async () => {
    if (!user) return;
    await memoirDb()`DELETE FROM accounts WHERE identity_sub = ${user.sub}`;
    await deleteIdentityUser(user);
    user = undefined;
  });

  test('should walk a fresh account through onboarding, lock the currency, and land a first quest on Today', async ({ page, context }) => {
    const url = requireProductUrl('memoir');
    user = await createIdentityUser({ label: 'memoir-onboarding' });
    await addIdentitySessionCookies(context, await createIdentitySession(user.userId));

    await page.goto(`${url}/api/auth/login?return_to=/onboarding`);
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.getByLabel('Wake time').fill('07:00');
    await page.getByLabel('Sleep time').fill('23:00');
    await page.getByLabel('Timezone').click();
    await page.getByRole('option', { name: 'Europe/London' }).click();
    await page.getByLabel('Home currency').click();
    await page.getByRole('option', { name: 'USD $' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    const questName = 'Read 10 pages';
    await page.getByRole('button', { name: questName }).click();
    await page.getByRole('group', { name: 'Stat' }).getByRole('button', { name: 'Mind' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // The frequency picker is a `SegmentedControl` (radiogroup of radios), not buttons.
    await page.getByRole('radio', { name: 'Every day' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Each option's label (name + cost line) is the click target; its inner spans fail Playwright's hit test.
    const strictness = page.getByRole('radiogroup', { name: 'Strictness' });
    await strictness.locator('label', { hasText: 'Routine' }).click();
    await expect(strictness.getByRole('radio', { name: /^Routine/ })).toBeChecked();
    await page.getByRole('button', { name: 'Review' }).click();

    await page.getByRole('button', { name: 'Create it and start' }).click();

    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: `Mark complete: ${questName}` })).toBeVisible();

    const ctx = await request.newContext({ baseURL: url, ignoreHTTPSErrors: true, storageState: await context.storageState() });
    const account = await getAccount(ctx);
    await ctx.dispose();
    expect(account.onboardingCompletedAt).not.toBeNull();
    expect(account.defaultCurrency).toBe('USD');
  });
});
