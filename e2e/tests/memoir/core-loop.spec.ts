/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { requireProductUrl } from '../../lib';
import { expect, test } from './fixtures';
import { createDailyQuest, hasQuestLogFor, memoirMutate, pullDelta, submitCommand } from './helpers';

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
test.describe('memoir core loop', () => {
  // Pinned because memoir-web takes Today from the browser's zone rather than the account's (app bug, fixme below); UTC matches the harness account.
  test.use({ timezoneId: 'UTC' });

  test('should complete a quest from Today, update Hero state, and persist across reload', async ({ page, context, memoir }) => {
    const url = requireProductUrl('memoir');
    const persona = await memoir.persona({ label: 'core-loop', onboard: true });
    await memoir.signInBrowser(context, persona);
    const { ctx } = persona;

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

test.describe('memoir core loop — account day', () => {
  // UTC-11 and UTC+14: the account's day and the browser's never coincide, whatever the hour.
  const ACCOUNT_ZONE = 'Pacific/Pago_Pago';
  test.use({ timezoneId: 'Pacific/Kiritimati' });

  test.fixme('should complete from Today on the account day (app bug: memoir-web sync-context.tsx:104 stamps the browser date; docs/memoir.md:22)', async ({
    page,
    context,
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'account-day' });
    const onboarded = await memoirMutate(persona.ctx, 'post', '/api/v1/account/onboarding', {
      data: { defaultCurrency: 'USD', timezone: ACCOUNT_ZONE, scheduleStartMin: 0, scheduleEndMin: 1439 },
    });
    expect(onboarded.status(), await onboarded.text()).toBe(200);

    const accountDay = new Intl.DateTimeFormat('en-CA', { timeZone: ACCOUNT_ZONE }).format(new Date());
    const questName = `E2E account day ${Date.now()}`;
    const draft = {
      name: questName,
      statAffinity: 'discipline',
      strictness: 'routine',
      recurrence: { frequency: 'daily', startDate: accountDay, end: { kind: 'count', count: 1 } },
    };
    const created = await submitCommand(persona.ctx, 'quest.create', draft, { localDate: accountDay });
    expect(created.status, JSON.stringify(created)).toBe('applied');

    await memoir.signInBrowser(context, persona);
    await page.goto(requireProductUrl('memoir'));
    await page.getByRole('button', { name: `Mark complete: ${questName}` }).click();

    const occurrenceId = `${String(created.result['id'])}:${accountDay}`;
    await expect
      .poll(async () => hasQuestLogFor(await pullDelta(persona.ctx), occurrenceId), { message: 'the completion must land on the account day', timeout: 15_000 })
      .toBe(true);
  });
});
