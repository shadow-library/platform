import { expect, test } from '@playwright/test';

import { requireProductUrl, storageStateFor } from '../../lib';

/**
 * `/login`'s `returnTo` open-redirect guard (only a same-origin path is honored: `startsWith('/') && !startsWith('//')`) and two bits of reader chrome (settings drawer, theme
 * toggle)
 * exposed by `aria-label`. The chrome checks run as `viewer`; all read-only.
 */
test.describe('login returnTo sanitization', () => {
  /**
   * `//evil.example.com` and `https://evil.com` are off-origin targets a naive passthrough would bounce a signed-in user to; the malicious host must not appear in the
   * `return_to` query value the login route hands to `/api/auth/login`.
   */
  const maliciousReturnTos = ['//evil.example.com', 'https://evil.com'];
  for (const malicious of maliciousReturnTos) {
    test(`should drop a malicious returnTo of ${malicious}`, async ({ page }) => {
      const url = requireProductUrl('webNovel');

      const requestedReturnTos: string[] = [];
      page.on('request', req => {
        const parsed = new URL(req.url());
        if (parsed.pathname !== '/api/auth/login') return;
        const returnTo = parsed.searchParams.get('return_to');
        if (returnTo) requestedReturnTos.push(returnTo);
      });

      await page.goto(`${url}/login?returnTo=${encodeURIComponent(malicious)}`);
      await page.waitForLoadState('domcontentloaded');

      for (const returnTo of requestedReturnTos) {
        expect(returnTo.startsWith('//'), `return_to "${returnTo}" must not be a protocol-relative off-origin URL`).toBe(false);
        expect(returnTo.includes('evil'), `return_to "${returnTo}" must not carry the attacker host through`).toBe(false);
      }
    });
  }
});

test.describe('reader chrome', () => {
  test.use({ storageState: storageStateFor('viewer') });

  test('should open the reading settings drawer', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(`${url}/read/e2e-public-novel/1`, { waitUntil: 'domcontentloaded' });

    // The top chrome hosting the "Reading settings" trigger renders conditionally, so wait for the chapter before clicking.
    await expect(page.getByText('Chapter 1 of the seeded novel', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'Reading settings' }).click();
    // The Drawer is modal by default, so Radix `Dialog.Content` renders `role="dialog"` with the forwarded `aria-label`.
    await expect(page.getByRole('dialog', { name: 'Reading settings' })).toBeVisible();
  });

  test('should toggle the theme', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(url, { waitUntil: 'load' });
    // A click before the client bundle hydrates lands on inert SSR markup and does nothing (same race as in `viewer-reading.spec.ts`); `networkidle` avoids it.
    await page.waitForLoadState('networkidle');

    const html = page.locator('html');
    const before = (await html.getAttribute('class')) ?? (await html.getAttribute('data-theme')) ?? '';
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect
      .poll(async () => (await html.getAttribute('class')) ?? (await html.getAttribute('data-theme')) ?? '', 'expected the theme toggle to change a root class/attribute')
      .not.toBe(before);
  });
});
