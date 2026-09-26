/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, requireProductUrl, storageStateFor } from '../../lib';
import { type ContentMode, type CostTier, type CreatedNovel, createNovel, deleteProjectQuietly, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface ProjectModels {
  contentMode: ContentMode;
  costTier: CostTier;
  models: { group: string; label: string; source: string }[];
}

interface ChatSession {
  costTier?: CostTier | null;
  contentMode?: ContentMode | null;
}

/**
 * Declaring the constants
 *
 * Model type (Standard / Unrestricted) and cost tier (Economy / Balanced / Performant), AI-free: the project default, a chat's own
 * setting, and a single turn's override are each stored and resolved without any model being called.
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

  test('should publish a platform model for every tier and model type', async () => {
    const catalog = (await (await ctx.get('/api/v1/ai/models')).json()) as { tiers: { costTier: CostTier; contentMode: ContentMode; group: string }[] };
    for (const costTier of TIERS) {
      for (const contentMode of MODES) {
        expect(
          catalog.tiers.some(tier => tier.costTier === costTier && tier.contentMode === contentMode),
          `${costTier} × ${contentMode}`,
        ).toBe(true);
      }
    }
  });

  test('should start at Standard · Balanced and persist a new project default', async () => {
    const before = (await (await ctx.get(`/api/v1/projects/${novel.projectId}`)).json()) as { costTier: CostTier; contentMode: ContentMode };
    expect(before).toMatchObject({ costTier: 'balanced', contentMode: 'standard' });

    const patch = await mutate(ctx, 'patch', `/api/v1/projects/${novel.projectId}`, { data: { costTier: 'economy', contentMode: 'unrestricted' } });
    expect(patch.status(), await patch.text()).toBe(200);
    expect((await patch.json()) as { costTier: CostTier; contentMode: ContentMode }).toMatchObject({ costTier: 'economy', contentMode: 'unrestricted' });

    await mutate(ctx, 'patch', `/api/v1/projects/${novel.projectId}`, { data: { costTier: 'balanced', contentMode: 'standard' } });
  });

  test('should resolve a chat model for every tier the author can pick', async () => {
    for (const costTier of TIERS) {
      const routes = (await (await ctx.get(`/api/v1/projects/${novel.projectId}/ai/models?costTier=${costTier}&contentMode=standard`)).json()) as ProjectModels;
      expect(routes).toMatchObject({ costTier, contentMode: 'standard' });
      expect(routes.models.find(route => route.group === 'chat')?.label, `${costTier} chat route`).toBeTruthy();
    }
  });

  test('should keep a chat’s own tier and model type, and clear them back to the project default', async () => {
    const path = `/api/v1/projects/${novel.projectId}/chat/sessions/${novel.sessionId}`;
    const pinned = await mutate(ctx, 'patch', `${path}/model`, { data: { costTier: 'performant', contentMode: 'unrestricted' } });
    expect(pinned.status(), await pinned.text()).toBe(200);
    expect((await (await ctx.get(path)).json()) as ChatSession).toMatchObject({ costTier: 'performant', contentMode: 'unrestricted' });

    const cleared = await mutate(ctx, 'patch', `${path}/model`, { data: { costTier: null, contentMode: null } });
    expect(cleared.status(), await cleared.text()).toBe(200);
    const session = (await (await ctx.get(path)).json()) as ChatSession;
    expect(session.costTier ?? null).toBeNull();
    expect(session.contentMode ?? null).toBeNull();
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

  test('should save a new project default from the Model & cost tab', async ({ page }) => {
    const novel = await createNovel(ctx, { title: `E2E Tier Settings ${uniqueSuffix()}` });
    created.push(novel.projectId);
    await page.goto(`${requireProductUrl('novelForge')}/novels/${novel.projectId}/settings?tab=models`);

    const tier = page.getByRole('radiogroup', { name: 'Cost tier' });
    const mode = page.getByRole('radiogroup', { name: 'Model type' });
    await expect(tier.getByRole('radio', { name: 'Balanced' })).toBeChecked({ timeout: 15_000 });
    await expect(mode.getByRole('radio', { name: 'Standard' })).toBeChecked();

    await tier.getByRole('radio', { name: 'Economy' }).click();
    await mode.getByRole('radio', { name: 'Unrestricted' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(async () => {
      const project = (await (await ctx.get(`/api/v1/projects/${novel.projectId}`)).json()) as { costTier: CostTier; contentMode: ContentMode };
      expect(project).toMatchObject({ costTier: 'economy', contentMode: 'unrestricted' });
    }).toPass({ timeout: 15_000 });
  });

  test('should switch the next turn’s tier and model type from the chat composer', async ({ page }) => {
    const novel = await createNovel(ctx, { title: `E2E Tier Chat ${uniqueSuffix()}` });
    created.push(novel.projectId);
    await page.goto(`${requireProductUrl('novelForge')}/novels/${novel.projectId}/chat?session=${novel.sessionId}`);

    const panel = page.getByRole('dialog', { name: 'Model and cost for this turn' });
    await expect(async () => {
      await page.getByRole('button', { name: 'Model and cost: Standard · Balanced, project default' }).click();
      await expect(panel).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await panel.getByRole('radiogroup', { name: 'Cost' }).getByRole('radio', { name: 'Economy' }).click();
    await panel.getByRole('radiogroup', { name: 'Model' }).getByRole('radio', { name: 'Unrestricted' }).click();
    await panel.getByRole('button', { name: 'Done' }).click();

    const trigger = page.getByRole('button', { name: 'Model and cost: Unrestricted · Economy, this turn only' });
    await expect(trigger).toBeVisible();

    await trigger.click();
    await panel.getByRole('button', { name: 'Use the default' }).click();
    await panel.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Model and cost: Standard · Balanced, project default' })).toBeVisible();

    const project = (await (await ctx.get(`/api/v1/projects/${novel.projectId}`)).json()) as { costTier: CostTier; contentMode: ContentMode };
    expect(project, 'a turn override never changes the project default').toMatchObject({ costTier: 'balanced', contentMode: 'standard' });
  });
});
