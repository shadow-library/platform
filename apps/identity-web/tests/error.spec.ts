/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * The hosted error page is the landing target of the OAuth authorize deny redirect (W-901 / D-A3). When the
 * redirect names the application access was refused to, the page must say which app and why — server-rendered,
 * before any client JS — so a refused customer knows exactly whom to ask.
 */
test.describe('hosted error page', () => {
  test('should name the application in the access-denied page from the deny redirect', async ({ page }) => {
    const response = await page.goto('/error?error=access_denied&application=Novel%20Forge&client_id=app_client_123');
    /** Assert the app-specific copy is in the SSR HTML (present before any client JS runs). */
    const html = await response?.text();
    expect(html).toContain('You don’t have access to Novel Forge');
    expect(html).toContain('Your organization hasn’t given you access to Novel Forge');
    await expect(page.getByRole('heading', { name: 'You don’t have access to Novel Forge' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible();
  });

  test('should fall back to the generic access-denied copy when no application is named', async ({ page }) => {
    await page.goto('/error?error=access_denied');
    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    await expect(page.getByText('You don’t have permission to sign in to this application.')).toBeVisible();
  });
});
