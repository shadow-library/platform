/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { findSetCookie, requireProductUrl } from '../../lib';
import { expect, test } from './fixtures';
import { createDailyQuest, hasQuestLogFor, memoirCsrfHeaders, pullDelta } from './helpers';

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
test.describe('memoir offline outbox', () => {
  test('should queue a quest completion while offline and flush it once back online', async ({ page, context, memoir }) => {
    const url = requireProductUrl('memoir');
    const persona = await memoir.persona({ label: 'offline', onboard: true });
    await memoir.signInBrowser(context, persona);
    const { ctx } = persona;

    const questName = `E2E offline ${Date.now()}`;
    const { occurrenceId } = await createDailyQuest(ctx, questName);

    await page.goto(url);
    const completeButton = page.getByRole('button', { name: `Mark complete: ${questName}` });
    await expect(completeButton).toBeVisible();

    await context.setOffline(true);
    // Toasts are `role="status"` too; `data-state` is carried only by the shell's connection strip.
    const netStrip = page.getByRole('status').and(page.locator('[data-state]'));
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

test.describe('memoir outbox — CSRF refusals', () => {
  test.fixme('should keep the CSRF cookie across a GET that carries a fresh cookie and no header (app bug: csrf-protection.middleware.ts:48 re-issues it)', async ({ memoir }) => {
    const { ctx } = await memoir.persona({ label: 'csrf-rotate', onboard: true });
    await memoirCsrfHeaders(ctx);

    const read = await ctx.get('/api/v1/account');
    expect(read.status()).toBe(200);
    expect(findSetCookie(read, 'csrf-token'), 'a valid, unexpired token must not be replaced').toBeUndefined();
  });

  test.fixme('should flush a command the server refused with S010 without the user asking again (app bug: sync-engine.ts:410-418 never schedules a retry)', async ({
    page,
    context,
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'csrf-retry', onboard: true });
    await memoir.signInBrowser(context, persona);
    const questName = `E2E csrf retry ${Date.now()}`;
    const { occurrenceId } = await createDailyQuest(persona.ctx, questName);

    let refused = false;
    await page.route('**/api/v1/sync/commands', async route => {
      if (refused || route.request().method() !== 'POST') return route.continue();
      refused = true;
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'S010', message: 'Access blocked due to security policy restrictions' }) });
    });

    await page.goto(requireProductUrl('memoir'));
    await page.getByRole('button', { name: `Mark complete: ${questName}` }).click();
    await expect.poll(() => refused).toBe(true);

    await expect
      .poll(async () => hasQuestLogFor(await pullDelta(persona.ctx), occurrenceId), { message: 'the refused completion must reach the server on its own', timeout: 30_000 })
      .toBe(true);
  });
});
