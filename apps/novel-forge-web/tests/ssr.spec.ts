/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Declaring the constants
 */

test.describe('Server-side rendering', () => {
  test('server-renders the dashboard shell in the initial HTML, before any JavaScript', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();

    // A full HTML document (not an empty SPA shell) comes back from the server.
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toMatch(/<title>[^<]*Novel Forge<\/title>/);
    // Route content — the Projects screen and the app chrome — is present in the server response itself.
    expect(html).toContain('Projects');
    expect(html).toContain('nf-sidebar');
    // The design-system stylesheet is linked in the SSR <head>, so there is no flash of unstyled content.
    expect(html).toContain('rel="stylesheet"');
  });

  test('hydrates the dashboard without console or hydration errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();

    // A hydration mismatch surfaces as a React console error; assert none were emitted.
    const hydrationErrors = errors.filter(e => /hydrat|did not match|server (?:HTML|rendered)|mismatch/i.test(e));
    expect(hydrationErrors, hydrationErrors.join('\n')).toEqual([]);
  });
});
