/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Guards that the SSR'd auth screens hydrate cleanly with `@shadow-library/ui` — no React hydration
 * mismatch, no uncaught errors — and that the DS components become interactive once the client takes over.
 * The design-system overlays (`Toaster`) that portal into `document.body` self-gate hydration, so a version
 * bump that regresses that guard would surface here as a mismatch rather than silently degrading SSR.
 */

const HYDRATION_MARKERS = ['hydrat', 'did not match', 'server rendered', 'server html', 'text content does not match', 'suppresshydrationwarning', 'minified react error #4'];

const CASES = [
  { path: '/login', heading: 'Sign in', ssrText: 'Enter your email or phone number' },
  { path: '/register', heading: 'Create your account', ssrText: 'Step 1 of 4' },
];

for (const { path, heading, ssrText } of CASES) {
  test(`should server-render and hydrate ${path} with no mismatch`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => pageErrors.push(err.message));

    // The content must be in the SSR HTML (present before any client JS runs), not painted post-hydration.
    const response = await page.goto(path);
    expect(await response?.text(), `SSR HTML for ${path} should contain "${ssrText}"`).toContain(ssrText);

    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();

    const hydrationErrors = [...consoleErrors, ...pageErrors].filter(text => HYDRATION_MARKERS.some(marker => text.toLowerCase().includes(marker)));

    expect(hydrationErrors, `hydration mismatch(es) on ${path}:\n${hydrationErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `uncaught page error(s) on ${path}:\n${pageErrors.join('\n')}`).toEqual([]);
  });
}

test('should attach event handlers on /login (proves hydration, not just SSR paint)', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  const input = page.getByPlaceholder('you@company.com');
  await input.fill('admin@shadow-apps.com');
  await expect(input).toHaveValue('admin@shadow-apps.com');
});
