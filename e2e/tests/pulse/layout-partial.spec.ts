import { expect, test } from '@playwright/test';

import { apiContext, mutate, requireProductUrl } from '../../lib';
import { createLayout, createPartial, deleteLayouts, deletePartials, publishLayout, publishPartial, saveLayoutDraft, savePartialDraft, uniqueKey } from './helpers';

/**
 * The layout and partial CMS mirrors the template CMS except a draft save (`PUT /:id/draft`) is a plain upsert, never a 409 on a second call as a template's `POST /draft` is.
 * Neither resource has a DELETE route, so `afterEach` removes the rows directly via `pulseDb()`.
 */
test.describe('layout and partial CMS lifecycle', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  let layoutIds: string[] = [];
  let partialIds: string[] = [];

  test.afterEach(async () => {
    await Promise.all([deleteLayouts(layoutIds), deletePartials(partialIds)]);
    layoutIds = [];
    partialIds = [];
  });

  test('should create a layout and reject a duplicate key with TPL_LYT_002', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const layoutKey = uniqueKey('layout');

    const created = await createLayout(ctx, { layoutKey, name: 'E2E layout' });
    layoutIds.push(created.id);
    expect(created.layoutKey).toBe(layoutKey);

    const duplicate = await mutate(ctx, 'post', '/api/v1/layouts', { data: { layoutKey, name: 'Duplicate' } });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()) as { code?: string }).toMatchObject({ code: 'TPL_LYT_002' });
  });

  test('should create a partial and reject a duplicate key with TPL_PRT_002', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const partialKey = uniqueKey('partial');

    const created = await createPartial(ctx, { partialKey, name: 'E2E partial' });
    partialIds.push(created.id);
    expect(created.partialKey).toBe(partialKey);

    const duplicate = await mutate(ctx, 'post', '/api/v1/partials', { data: { partialKey, name: 'Duplicate' } });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()) as { code?: string }).toMatchObject({ code: 'TPL_PRT_002' });
  });

  test('should save a layout draft, let a second save update it in place, then publish it', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const created = await createLayout(ctx, { layoutKey: uniqueKey('layout-publish'), name: 'E2E publishable layout' });
    layoutIds.push(created.id);

    const draft = await saveLayoutDraft(ctx, created.id, { body: '<html><body>{{ content | raw }}</body></html>' });
    expect(draft.status(), await draft.text()).toBe(200);
    expect((await draft.json()) as { version: number; status: string }).toMatchObject({ version: 1, status: 'DRAFT' });

    // Unlike a template's draft (409 TPL_PUB_004 on a second open), a second layout draft save updates the same row.
    const redraft = await saveLayoutDraft(ctx, created.id, { body: '<html><body>updated {{ content | raw }}</body></html>' });
    expect(redraft.status()).toBe(200);
    expect((await redraft.json()) as { version: number }).toMatchObject({ version: 1 });

    const published = await publishLayout(ctx, created.id, 'e2e publish');
    expect(published.status(), await published.text()).toBe(200);
    expect((await published.json()) as { status: string }).toMatchObject({ status: 'PUBLISHED' });
  });

  test('should reject publishing a layout with no open draft with TPL_PUB_001', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const created = await createLayout(ctx, { layoutKey: uniqueKey('layout-no-draft'), name: 'E2E no-draft layout' });
    layoutIds.push(created.id);

    const response = await mutate(ctx, 'post', `/api/v1/layouts/${created.id}/publish`, { data: {} });
    expect(response.status()).toBe(409);
    expect((await response.json()) as { code?: string }).toMatchObject({ code: 'TPL_PUB_001' });
  });

  test('should save and publish a partial draft', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const created = await createPartial(ctx, { partialKey: uniqueKey('partial-publish'), name: 'E2E publishable partial' });
    partialIds.push(created.id);

    const draft = await savePartialDraft(ctx, created.id, { body: '<span>{{ label }}</span>' });
    expect(draft.status(), await draft.text()).toBe(200);
    expect((await draft.json()) as { version: number; status: string }).toMatchObject({ version: 1, status: 'DRAFT' });

    const published = await publishPartial(ctx, created.id, 'e2e publish');
    expect(published.status(), await published.text()).toBe(200);
    expect((await published.json()) as { status: string }).toMatchObject({ status: 'PUBLISHED' });
  });

  test('should reject publishing a partial with no open draft with TPL_PUB_001', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const created = await createPartial(ctx, { partialKey: uniqueKey('partial-no-draft'), name: 'E2E no-draft partial' });
    partialIds.push(created.id);

    const response = await mutate(ctx, 'post', `/api/v1/partials/${created.id}/publish`, { data: {} });
    expect(response.status()).toBe(409);
    expect((await response.json()) as { code?: string }).toMatchObject({ code: 'TPL_PUB_001' });
  });

  test('should list the seeded default layout and otp-code/button partials', async () => {
    const ctx = await apiContext('pulse', 'admin');

    const layouts = await ctx.get('/api/v1/layouts');
    expect(layouts.status()).toBe(200);
    const { items: layoutItems } = (await layouts.json()) as { items: { layoutKey: string }[] };
    expect(layoutItems.some(item => item.layoutKey === 'default')).toBe(true);

    const partials = await ctx.get('/api/v1/partials');
    expect(partials.status()).toBe(200);
    const { items: partialItems } = (await partials.json()) as { items: { partialKey: string }[] };
    const partialKeys = partialItems.map(item => item.partialKey);
    expect(partialKeys).toEqual(expect.arrayContaining(['otp-code', 'button']));
  });
});
