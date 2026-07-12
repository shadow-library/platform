/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * End-to-end smoke coverage. The auth-flow test drives the real identity backend through the dev
 * proxy: entering an identifier calls `POST /auth/login/init` and the page advances on the returned
 * `status`, exercising the cookie-session + CSRF round-trip.
 */

test.describe('hosted auth', () => {
  test('should render the sign-in screen', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Secured by Shadow Identity')).toBeVisible();
  });

  test('should advance from identifier to the password step via the live API', async ({ page }) => {
    await page.goto('/login');
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

test.describe('account portal', () => {
  test('should bounce unauthenticated visitors to sign-in', async ({ page }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
