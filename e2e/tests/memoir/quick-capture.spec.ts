import { requireProductUrl } from '../../lib';
import { expect, test } from './fixtures';

test.describe('memoir quick capture', () => {
  test('should log an expense through the command palette and show it on the Finance screen', async ({ page, context, memoir }) => {
    const url = requireProductUrl('memoir');
    await memoir.signInBrowser(context, await memoir.persona({ label: 'quick-expense', onboard: true }));

    await page.goto(url);
    // The ⌘K listener is registered by a shell effect after hydration and `page.goto` only waits for `load`, so re-send the shortcut until the palette opens, and only while
    // closed (a second press toggles it shut).
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

  test('should save a journal entry from /log and show it in the entry list', async ({ page, context, memoir }) => {
    const url = requireProductUrl('memoir');
    await memoir.signInBrowser(context, await memoir.persona({ label: 'quick-journal', onboard: true }));

    await page.goto(`${url}/log`);
    await expect(page.getByRole('heading', { name: 'Journal', level: 2 })).toBeVisible();

    const entryText = `E2E journal entry ${Date.now()}`;
    await page.getByPlaceholder('Write as much or as little as you like. One line counts.').fill(entryText);
    await page.getByRole('button', { name: 'Save entry' }).click();

    // The saved entry renders twice (list row and a preview excerpt), so an unscoped text match is ambiguous under strict mode; `.first()` needs any instance.
    await expect(page.getByText(entryText).first()).toBeVisible();
  });
});
