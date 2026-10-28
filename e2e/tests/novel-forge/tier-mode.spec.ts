import { type APIRequestContext } from '@playwright/test';

import { apiContext, mutate, requireProductUrl, storageStateFor } from '../../lib';
import { expect, test } from './forge-actors';
import { unrestrictedAvailable } from './forge-arrange';
import { type ContentMode, type CostTier, type CreatedNovel, createNovel, deleteProjectQuietly, errorCode, uniqueSuffix } from './forge-helpers';

interface ProjectModels {
  contentMode: ContentMode;
  costTier: CostTier;
  models: { group: string; label: string }[];
}

/**
 * AI-free: model type (Standard / Unrestricted) and cost tier (Economy / Balanced / Performant) live on the project; a chat holds neither, and a turn's one-shot options are
 * never stored. Unrestricted is chosen only where the target's catalog routes it.
 */

const TIERS: readonly CostTier[] = ['economy', 'balanced', 'performant'];
const MODES: readonly ContentMode[] = ['standard', 'unrestricted'];

test.describe('novel-forge model type and cost tier (API)', () => {
  let ctx: APIRequestContext;
  let novel: CreatedNovel;

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
    novel = await createNovel(ctx, { title: `E2E Tiers ${uniqueSuffix()}` });
  });

  test.afterAll(async () => {
    await deleteProjectQuietly(ctx, novel.projectId);
    await ctx.dispose();
  });

  test('should offer an author the paces and never the models behind them', async () => {
    const options = (await (await ctx.get('/api/v1/ai/models')).json()) as Record<string, unknown>;
    expect(options['paces']).toEqual(TIERS);
    expect(typeof options['unrestrictedAvailable']).toBe('boolean');
    for (const field of ['profile', 'models', 'defaults', 'tiers', 'modelLabels']) expect(options, `${field} is admin-only`).not.toHaveProperty(field);
    expect((await ctx.get('/api/v1/ai/models/admin')).status(), 'the full catalog is admin-only').toBe(403);
  });

  test('should publish a platform model for every tier and model type to an admin', async ({ forge }) => {
    const admin = await forge.actor({ label: 'tiers-admin', roles: ['NovelForgeAdmin'] });
    const response = await admin.ctx.get('/api/v1/ai/models/admin');
    expect(response.status(), await response.text()).toBe(200);
    const catalog = (await response.json()) as { tiers: { costTier: CostTier; contentMode: ContentMode; group: string }[] };
    for (const costTier of TIERS) {
      for (const contentMode of MODES) {
        expect(
          catalog.tiers.some(tier => tier.costTier === costTier && tier.contentMode === contentMode),
          `${costTier} × ${contentMode}`,
        ).toBe(true);
      }
    }
  });

  test('should start at Standard · Balanced and persist a new project pace', async () => {
    const before = (await (await ctx.get(`/api/v1/projects/${novel.projectId}`)).json()) as { costTier: CostTier; contentMode: ContentMode };
    expect(before).toMatchObject({ costTier: 'balanced', contentMode: 'standard' });

    const patch = await mutate(ctx, 'patch', `/api/v1/projects/${novel.projectId}`, { data: { costTier: 'economy' } });
    expect(patch.status(), await patch.text()).toBe(200);
    expect((await patch.json()) as { costTier: CostTier; contentMode: ContentMode }).toMatchObject({ costTier: 'economy', contentMode: 'standard' });

    await mutate(ctx, 'patch', `/api/v1/projects/${novel.projectId}`, { data: { costTier: 'balanced' } });
  });

  test('should refuse raising a novel to unrestricted where unrestricted writing is not set up', async () => {
    test.skip(await unrestrictedAvailable(ctx), 'the target routes unrestricted writing, so nothing is refused');

    const patch = await mutate(ctx, 'patch', `/api/v1/projects/${novel.projectId}`, { data: { contentMode: 'unrestricted' } });
    expect(patch.status(), await patch.text()).toBe(400);
    expect(await errorCode(patch)).toBe('AI_024');
    expect(((await (await ctx.get(`/api/v1/projects/${novel.projectId}`)).json()) as { contentMode: ContentMode }).contentMode).toBe('standard');
  });

  test('should resolve a chat model for every tier to an admin, and refuse the routes to an author', async ({ forge }) => {
    expect((await ctx.get(`/api/v1/projects/${novel.projectId}/ai/models`)).status(), "a novel's model routes are admin-only").toBe(403);

    const admin = await forge.actor({ label: 'tiers-routes', roles: ['NovelForgeAdmin'] });
    const own = await createNovel(admin.ctx, { title: `E2E Tier Routes ${uniqueSuffix()}` });
    for (const costTier of TIERS) {
      const routes = (await (await admin.ctx.get(`/api/v1/projects/${own.projectId}/ai/models?costTier=${costTier}&contentMode=standard`)).json()) as ProjectModels;
      expect(routes).toMatchObject({ costTier, contentMode: 'standard' });
      expect(routes.models.find(route => route.group === 'chat')?.label, `${costTier} chat route`).toBeTruthy();
    }
  });

  test('should hold no tier or model type on a chat, which follows its project', async () => {
    const session = (await (await ctx.get(`/api/v1/projects/${novel.projectId}/chat/sessions/${novel.sessionId}`)).json()) as Record<string, unknown>;
    expect(session).not.toHaveProperty('costTier');
    expect(session).not.toHaveProperty('contentMode');
  });
});

test.describe('novel-forge model type and cost tier (UI)', () => {
  test.use({ storageState: storageStateFor('user1') });

  let ctx: APIRequestContext;
  const created: string[] = [];

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
  });

  test.afterAll(async () => {
    for (const projectId of created) await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
  });

  test('should save a new project pace from the Pace tab, offering a content mode only where unrestricted is set up', async ({ page }) => {
    const novel = await createNovel(ctx, { title: `E2E Tier Settings ${uniqueSuffix()}` });
    created.push(novel.projectId);
    const available = await unrestrictedAvailable(ctx);
    await page.goto(`${requireProductUrl('novelForge')}/novels/${novel.projectId}/settings?tab=models`);

    const pace = page.getByRole('radiogroup', { name: 'Pace' });
    await expect(pace.getByRole('radio', { name: 'Steady' })).toBeChecked({ timeout: 15_000 });
    await expect(page.getByText('Careful planning, natural prose. Right for most of the book.')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Content mode' })).toHaveCount(available ? 1 : 0);
    await expect(page.getByText('What that means for each job'), 'the per-job models are admin-only').toHaveCount(0);

    await pace.getByRole('radio', { name: 'Swift' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(async () => {
      const project = (await (await ctx.get(`/api/v1/projects/${novel.projectId}`)).json()) as { costTier: CostTier; contentMode: ContentMode };
      expect(project).toMatchObject({ costTier: 'economy', contentMode: 'standard' });
    }).toPass({ timeout: 15_000 });
  });
});
