/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

test.describe('Dashboard page', () => {
  test.beforeEach(({ page }) => page.goto('/'));

  test('should load successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/Shadow Pulse/);
  });
});
