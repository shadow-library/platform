import { expect, test } from '@playwright/test';

import { apiContext, requireProductUrl, storageStateFor } from '../../lib';
import { ensureOnboarded, getAccount, memoirMutate } from './helpers';

test.describe('memoir settings', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should round-trip a notification preference toggle from the settings screen', async ({ page }) => {
    const url = requireProductUrl('memoir');
    const ctx = await apiContext('memoir', 'user1');
    await ensureOnboarded(ctx);

    const before = await getAccount(ctx);
    const nextBillingReminders = !before.notificationPrefs?.billingReminders;

    await page.goto(`${url}/settings/notifications`);
    const toggle = page.getByLabel('Billing reminders by email');
    await expect(toggle).toBeVisible();
    // The switch is controlled from the account query and flips only after the `notification.set` PATCH round-trip refetches; `setChecked` checks immediately and races it, so
    // click then wait for the attribute.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', String(nextBillingReminders));

    await expect
      .poll(async () => (await getAccount(ctx)).notificationPrefs?.billingReminders, { message: 'expected the toggle to persist to the account' })
      .toBe(nextBillingReminders);

    // Revert so the spec is idempotent against the persistent user1 account.
    await memoirMutate(ctx, 'patch', '/api/v1/account', { data: { notificationPrefs: { billingReminders: before.notificationPrefs?.billingReminders ?? false } } });
  });

  test('should accept an export request and reflect it on the status endpoint', async ({ page }) => {
    const url = requireProductUrl('memoir');
    const ctx = await apiContext('memoir', 'user1');
    await ensureOnboarded(ctx);

    await page.goto(`${url}/settings/export`);
    await expect(page.getByRole('button', { name: 'Prepare the export' })).toBeVisible();

    const response = await memoirMutate(ctx, 'post', '/api/v1/account/export');
    // 201 = accepted this run; 409 (EXP_002) = the once-a-day limit already spent by an earlier run today: either proves the request was understood and accounted for.
    expect([201, 409]).toContain(response.status());

    if (response.status() === 201) {
      const job = (await response.json()) as { id: string; status: string };
      expect(job.status).toBeTruthy();

      await expect
        .poll(
          async () => {
            const statusResponse = await ctx.get(`/api/v1/account/export/${job.id}`);
            expect(statusResponse.ok()).toBeTruthy();
            const body = (await statusResponse.json()) as { status: string };
            return body.status;
          },
          { message: 'expected the export job status endpoint to keep answering for the requested job', timeout: 10_000, intervals: [1_000] },
        )
        .not.toBe('');
    }
  });
});
