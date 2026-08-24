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
 * Creates a fresh daily quest via `quest.create` (so completing it always has an XP/coin delta to observe,
 * unlike reusing a quest that may have already paid out today's reward), completes it from the real Today
 * screen, and checks the result both in the UI and by pulling the server's own delta — the round trip the
 * offline outbox exists to make invisible to the user.
 */
test.describe('shadow memoir core loop', () => {
  test.use({ storageState: storageStateFor('user1') });

  test('should complete a quest from Today, update Hero state, and persist across reload', async ({ page }) => {
    const url = requireProductUrl('memoir');
    const ctx = await apiContext('memoir', 'user1');
    await ensureOnboarded(ctx);

    const questName = `E2E core loop ${Date.now()}`;
    const { occurrenceId } = await createDailyQuest(ctx, questName);

    await page.goto(url);
    const completeButton = page.getByRole('button', { name: `Mark complete: ${questName}` });
    await expect(completeButton).toBeVisible();

    const xpBefore = await page.getByRole('progressbar').getAttribute('aria-valuenow');

    await completeButton.click();
    await expect(page.getByRole('button', { name: `Completed: ${questName}` })).toBeVisible();
    await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', xpBefore ?? '');

    // Give the outbox its round trip, then confirm the server actually recorded the completion (not just an
    // optimistic local flip) before reloading and asserting the state survived a fresh page load.
    await expect
      .poll(async () => hasQuestLogFor(await pullDelta(ctx), occurrenceId), { message: 'expected the completed occurrence to appear in a quest_logs delta', timeout: 15_000 })
      .toBe(true);

    await page.reload();
    await expect(page.getByRole('button', { name: `Completed: ${questName}` })).toBeVisible();
  });
});
