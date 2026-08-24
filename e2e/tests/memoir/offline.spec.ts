/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, requireProductUrl, storageStateFor } from '../../lib';
import { createDailyQuest, ensureOnboarded, hasQuestLogFor, pullDelta } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * No prior offline-mode Playwright precedent exists in this monorepo (checked `apps/web-novel-web` and the
 * rest of `e2e/tests/` — nothing uses `context.setOffline`), so this is the first. It drives Playwright's own
 * network emulation (`BrowserContext.setOffline`) rather than the OS network, which is what the client's own
 * `navigator.onLine`-driven `NetStrip` reacts to.
 */
test.describe('shadow memoir offline outbox', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should queue a quest completion while offline and flush it once back online', async ({ page, context }) => {
    const url = requireProductUrl('memoir');
    const ctx = await apiContext('memoir', 'user1');
    await ensureOnboarded(ctx);

    const questName = `E2E offline ${Date.now()}`;
    const { occurrenceId } = await createDailyQuest(ctx, questName);

    await page.goto(url);
    const completeButton = page.getByRole('button', { name: `Mark complete: ${questName}` });
    await expect(completeButton).toBeVisible();

    await context.setOffline(true);
    const netStrip = page.getByRole('status');
    await expect(netStrip).toContainText(/offline/i);

    await completeButton.click();
    await expect(page.getByRole('button', { name: `Completed: ${questName}` })).toBeVisible();

    await context.setOffline(false);
    await expect(netStrip).toBeHidden({ timeout: 20_000 });

    await expect
      .poll(async () => hasQuestLogFor(await pullDelta(ctx), occurrenceId), {
        message: 'expected the offline-queued completion to flush and appear in a quest_logs delta',
        timeout: 20_000,
      })
      .toBe(true);

    await page.reload();
    await expect(page.getByRole('button', { name: `Completed: ${questName}` })).toBeVisible();
  });
});
