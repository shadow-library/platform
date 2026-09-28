/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, requireProductUrl, storageStateFor } from '../../lib';
import { createNovel, deleteProjectQuietly, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface UsageTotals {
  totalCostUsd: number;
  calls: number;
  byGroup: unknown[];
  byModel: unknown[];
  byTier: unknown[];
  byContentMode: unknown[];
  byDay: unknown[];
}

/**
 * Declaring the constants
 *
 * The usage and charges screens, AI-free. A fresh novel has made no model call, so its screen is asserted on its empty states; the
 * account screen is asserted on structure only, since other specs spend concurrently.
 */

test.describe('novel-forge usage and charges', () => {
  test.use({ storageState: storageStateFor('user1') });

  let ctx: APIRequestContext;
  let projectId = '';
  let title = '';

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
    title = `E2E Usage ${uniqueSuffix()}`;
    projectId = (await createNovel(ctx, { title })).projectId;
  });

  test.afterAll(async () => {
    await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
  });

  test('should report zero spend for a novel that has made no model call', async () => {
    const cost = (await (await ctx.get(`/api/v1/projects/${projectId}/cost`)).json()) as UsageTotals;
    expect(cost).toMatchObject({ totalCostUsd: 0, calls: 0, byModel: [], byTier: [], byContentMode: [] });
  });

  test('should report account usage with every breakdown and the quota window', async () => {
    const usage = await ctx.get('/api/v1/ai/usage');
    expect(usage.status(), await usage.text()).toBe(200);
    const body = (await usage.json()) as UsageTotals & { byProject: unknown[]; last30DaysCostUsd: number };
    for (const key of ['byGroup', 'byModel', 'byTier', 'byContentMode', 'byDay', 'byProject'] as const) expect(Array.isArray(body[key]), key).toBe(true);
    expect(body.totalCostUsd).toBeGreaterThanOrEqual(body.last30DaysCostUsd);

    const quota = await ctx.get('/api/v1/ai/quota');
    expect(quota.status(), await quota.text()).toBe(200);
  });

  test('should show a novel’s usage screen with its empty breakdowns and a period switch', async ({ page }) => {
    await page.goto(`${requireProductUrl('novelForge')}/novels/${projectId}/usage`);

    await expect(page.getByRole('heading', { name: 'Usage & charges', level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'By model · all time' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Runs' })).toBeVisible();
    await expect(page.getByText('No model calls yet.').first()).toBeVisible();

    const period = page.getByRole('radiogroup', { name: 'Period' });
    const radios = period.getByRole('radio');
    const states = await Promise.all((await radios.all()).map(radio => radio.isChecked()));
    expect(states, 'the period switch offers a period not already chosen').toContain(false);
    const chosen = radios.nth(states.indexOf(false));
    await chosen.click();
    await expect(chosen).toBeChecked();
  });

  test('should show the account usage screen with a per-novel breakdown', async ({ page }) => {
    await page.goto(`${requireProductUrl('novelForge')}/usage`);

    await expect(page.getByRole('heading', { name: 'Usage & charges', level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'By novel · all time' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'By model · all time' })).toBeVisible();
  });
});
