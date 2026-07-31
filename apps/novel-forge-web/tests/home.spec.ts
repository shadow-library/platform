/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Declaring the constants
 */

test.describe('Application shell', () => {
  test.beforeEach(({ page }) => page.goto('/'));

  test('loads with the correct document title', async ({ page }) => {
    await expect(page).toHaveTitle(/Novel Forge/);
  });

  test('renders the Shadow UI sidebar and dashboard chrome', async ({ page }) => {
    // Brand in the sidebar
    await expect(page.getByText('Novel Forge')).toBeVisible();
    // Global-mode nav lands on the Projects screen
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    // The command-palette trigger is present in the top bar
    await expect(page.getByText('Search or run a command…')).toBeVisible();
  });

  test('the command palette opens on its trigger', async ({ page }) => {
    // SSR hydration can lag the first paint (session gate + dev-server transforms), and a click that
    // lands before React attaches handlers is silently lost — retry the gesture until the UI responds.
    await expect(async () => {
      await page.getByText('Search or run a command…').click();
      await expect(page.getByPlaceholder('Search screens, projects, commands…')).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
  });
});
