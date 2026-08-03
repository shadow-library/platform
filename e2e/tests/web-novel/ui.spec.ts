/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { requireProductUrl } from '../../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Two pieces of shell polish: `/login`'s `returnTo` open-redirect guard (only a same-origin path is honored —
 * `startsWith('/') && !startsWith('//')`, per the web-novel report), and two device-local drawers the shared
 * `Shell`/reader chrome exposes by `aria-label`. These are read-only UI checks; nothing here touches seeded data.
 */
test.describe('login returnTo sanitization', () => {
  /**
   * `//evil.example.com` and `https://evil.com` are both attacker-controlled off-origin targets a naive
   * `returnTo` passthrough would happily bounce a signed-in user to. The login route hands off to
   * `/api/auth/login?return_to=...`, so the guard is checked in the URL the browser is left navigating toward
   * (or actually reaches, cross-origin, once the OIDC hop completes) — either way, the malicious host must not
   * appear in the `return_to` query value.
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
  test('should open the reading settings drawer', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(`${url}/read/e2e-public-novel/1`, { waitUntil: 'domcontentloaded' });

    // Wait for the chapter itself to render before touching chrome — the top chrome (which hosts the "Reading
    // settings" trigger) is conditionally rendered, and clicking it before the chapter query resolves can miss.
    await expect(page.getByText('Chapter 1 of the seeded novel', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'Reading settings' }).click();
    // The Drawer defaults to modal (`Drawer.tsx`'s `modal = true`), wrapping Radix `Dialog.Content` — which
    // renders `role="dialog"` — with `aria-label="Reading settings"` forwarded straight through.
    await expect(page.getByRole('dialog', { name: 'Reading settings' })).toBeVisible();
  });

  test('should toggle the theme', async ({ page }) => {
    const url = requireProductUrl('webNovel');
    await page.goto(url, { waitUntil: 'load' });
    // A click that lands before the client bundle hydrates can land on inert SSR markup — no listener yet — and
    // silently do nothing (the same race documented on the "Chapters" tab in `guest-reading.spec.ts`). Waiting
    // for `networkidle` avoids it.
    await page.waitForLoadState('networkidle');

    const html = page.locator('html');
    const before = (await html.getAttribute('class')) ?? (await html.getAttribute('data-theme')) ?? '';
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect
      .poll(async () => (await html.getAttribute('class')) ?? (await html.getAttribute('data-theme')) ?? '', 'expected the theme toggle to change a root class/attribute')
      .not.toBe(before);
  });
});
