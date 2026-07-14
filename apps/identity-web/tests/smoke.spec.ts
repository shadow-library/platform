/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * End-to-end smoke coverage against a real, server-rendered TanStack Start build. The auth-flow test
 * drives the live identity backend through a Start server function: entering an identifier calls
 * `POST /auth/login/init` (server-side), and the page advances on the returned `status`, exercising the
 * SSR cookie-session + CSRF round-trip and the Set-Cookie relay back to the browser.
 */

test.describe('hosted auth', () => {
  test('should server-render the sign-in screen', async ({ page }) => {
    const response = await page.goto('/login');
    // Assert the content is in the SSR HTML (present before any client JS runs), not painted post-hydration.
    expect(await response?.text()).toContain('Enter your email or phone number');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Secured by Shadow Identity')).toBeVisible();
  });

  test('should advance from identifier to the password step via the live API', async ({ page }) => {
    await page.goto('/login');
    // Wait for hydration before interacting: the controlled DS input only records the value once React
    // has attached, so filling mid-hydration would be lost.
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('you@company.com').fill('admin@shadow-apps.com');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible({ timeout: 15_000 });
  });

  test('should render the registration wizard', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByText('Step 1 of 4 · Account')).toBeVisible();
  });
});

test.describe('authenticated route guards', () => {
  test('should redirect unauthenticated portal visitors to sign-in, preserving the destination', async ({ page }) => {
    await page.goto('/account/security');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount%2Fsecurity/, { timeout: 15_000 });
  });

  test('should guard the operator console (session enforced before any console markup renders)', async ({ page }) => {
    const response = await page.goto('/console/users');
    // The guard runs in `beforeLoad`, so the initial SSR request is already a redirect — no console shell leaks.
    expect(response?.url()).toMatch(/\/login/);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
