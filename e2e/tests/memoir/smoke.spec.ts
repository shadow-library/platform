/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, requireProductUrl } from '../../lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The internal health contract (`/health/live`, `/health/ready`) is asserted for every configured product,
 * memoir included, by `tests/health-not-exposed.spec.ts` — nothing memoir-specific belongs here for that.
 */
test.describe('shadow memoir smoke', () => {
  test.beforeEach(() => requireProductUrl('memoir'));

  test('should load the memoir web shell for a signed-out visitor', async ({ page }) => {
    const url = requireProductUrl('memoir');
    await page.goto(url);
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('should 401 an unauthenticated sync delta pull', async () => {
    const ctx = await apiContext('memoir');
    const response = await ctx.get('/api/v1/sync/delta?since=0');
    expect(response.status()).toBe(401);
  });

  test('should 401 an unauthenticated sync command batch', async () => {
    const ctx = await apiContext('memoir');
    const response = await ctx.post('/api/v1/sync/commands', { data: { commands: [] } });
    expect(response.status()).toBe(401);
  });
});
