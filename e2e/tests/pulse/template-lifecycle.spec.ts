/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, requireProductUrl } from '../../lib';
import { createTemplate, deactivateTemplate, openDraft, publishDraft, putDraftContent, uniqueKey } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Request-level coverage of the template CMS's draft → publish lifecycle
 * (`apps/pulse-server/src/modules/template/template-version.service.ts`), driven as `admin` (PulseAdmin holds
 * `pulse:templates:write` + the elevated `pulse:templates:publish`). Every template this file creates carries a
 * `uniqueKey('tpl')` key and is deactivated (not deleted — `TemplateController` has no `DELETE` route) in an
 * `afterEach`, so nothing here touches the baseline `auth.*` catalog.
 */
test.describe('template lifecycle', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  let createdTemplateIds: string[] = [];

  test.afterEach(async () => {
    const ctx = await apiContext('pulse', 'admin');
    await Promise.all(createdTemplateIds.map(id => deactivateTemplate(ctx, id)));
    createdTemplateIds = [];
  });

  test('should create a template and reject a duplicate key with TPL_002', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const templateKey = uniqueKey('tpl-lifecycle');

    const created = await createTemplate(ctx, { templateKey, messageType: 'TRANSACTIONAL', name: 'E2E lifecycle template' });
    createdTemplateIds.push(created.id);
    expect(created.templateKey).toBe(templateKey);

    const duplicate = await mutate(ctx, 'post', '/api/v1/templates', { data: { templateKey, name: 'Duplicate', messageType: 'TRANSACTIONAL' } });
    expect(duplicate.status()).toBe(409);
    const body = (await duplicate.json()) as { code?: string };
    expect(body.code).toBe('TPL_002');
  });

  test('should open a draft version (201), then reject a second open with 409 TPL_PUB_004', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const created = await createTemplate(ctx, { templateKey: uniqueKey('tpl-draft'), messageType: 'TRANSACTIONAL' });
    createdTemplateIds.push(created.id);

    const first = await openDraft(ctx, created.id);
    expect(first.status()).toBe(201);

    // A second open while a draft is already outstanding is a conflict, not a silent no-op — opening a draft
    // is the "start editing" action, and swallowing the second call would hide a concurrent editor.
    const second = await openDraft(ctx, created.id);
    expect(second.status()).toBe(409);
    const body = (await second.json()) as { code?: string };
    expect(body.code).toBe('TPL_PUB_004');
  });

  test('should publish a draft with declared-variable content, then preview and roll back', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const templateKey = uniqueKey('tpl-publish');
    const created = await createTemplate(ctx, {
      templateKey,
      messageType: 'TRANSACTIONAL',
      variableSchema: { variables: { greeting: { type: 'string', required: true, example: 'hello' } } },
    });
    createdTemplateIds.push(created.id);
    await mutate(ctx, 'put', `/api/v1/templates/${created.id}/channels/EMAIL`, { data: { isEnabled: true } });

    await openDraft(ctx, created.id);
    const content = await putDraftContent(ctx, created.id, { channel: 'EMAIL', locale: 'en-ZZ', subject: 'Hi', body: 'Message: {{ greeting }}' });
    expect(content.status()).toBe(200);

    const published = await publishDraft(ctx, created.id, 'e2e publish');
    expect(published.status()).toBe(200);
    const publishedBody = (await published.json()) as { status: string; version: number };
    expect(publishedBody.status).toBe('PUBLISHED');

    const preview = await mutate(ctx, 'post', `/api/v1/templates/${created.id}/versions/preview`, { data: { channel: 'EMAIL', locale: 'en-ZZ', data: { greeting: 'World' } } });
    expect(preview.status()).toBe(200);
    const previewBody = (await preview.json()) as { subject?: string | null; body: string };
    expect(previewBody.body).toContain('World');

    // Roll back to the same (only) published version — a no-op content-wise, but exercises the endpoint's success path.
    const rollback = await mutate(ctx, 'post', `/api/v1/templates/${created.id}/versions/${publishedBody.version}/rollback`, { data: { notes: 'e2e rollback' } });
    expect(rollback.status()).toBe(200);
    const rollbackBody = (await rollback.json()) as { status: string; version: number };
    expect(rollbackBody.status).toBe('PUBLISHED');
    expect(rollbackBody.version, 'rollback creates a new version, not a rewind of the old one').toBeGreaterThan(publishedBody.version);
  });

  test('should reject publishing with no open draft with TPL_PUB_001', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const created = await createTemplate(ctx, { templateKey: uniqueKey('tpl-no-draft'), messageType: 'TRANSACTIONAL' });
    createdTemplateIds.push(created.id);

    const response = await mutate(ctx, 'post', `/api/v1/templates/${created.id}/versions/draft/publish`, { data: {} });
    expect(response.status()).toBe(409);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('TPL_PUB_001');
  });

  test('should archive the previously published version when a second version publishes', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const created = await createTemplate(ctx, { templateKey: uniqueKey('tpl-history'), messageType: 'TRANSACTIONAL' });
    createdTemplateIds.push(created.id);
    await mutate(ctx, 'put', `/api/v1/templates/${created.id}/channels/EMAIL`, { data: { isEnabled: true } });

    for (const body of ['First cut', 'Second cut']) {
      await openDraft(ctx, created.id);
      await putDraftContent(ctx, created.id, { channel: 'EMAIL', locale: 'en-ZZ', subject: 'Hi', body });
      const published = await publishDraft(ctx, created.id);
      expect(published.status(), await published.text()).toBe(200);
    }

    const versions = await ctx.get(`/api/v1/templates/${created.id}/versions`);
    expect(versions.status()).toBe(200);
    const { items } = (await versions.json()) as { items: { version: number; status: string }[] };
    expect(items.map(item => ({ version: item.version, status: item.status })).sort((left, right) => left.version - right.version)).toEqual([
      { version: 1, status: 'ARCHIVED' },
      { version: 2, status: 'PUBLISHED' },
    ]);
  });

  test('should persist a channel toggle and reflect it on the template detail read', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const created = await createTemplate(ctx, { templateKey: uniqueKey('tpl-channel'), messageType: 'TRANSACTIONAL' });
    createdTemplateIds.push(created.id);

    const channelOf = async (channel: string): Promise<{ channel: string; isEnabled: boolean } | undefined> => {
      const detail = await ctx.get(`/api/v1/templates/${created.id}`);
      expect(detail.status()).toBe(200);
      const { channels } = (await detail.json()) as { channels: { channel: string; isEnabled: boolean }[] };
      return channels.find(setting => setting.channel === channel);
    };

    const enabled = await mutate(ctx, 'put', `/api/v1/templates/${created.id}/channels/SMS`, { data: { isEnabled: true } });
    expect(enabled.status()).toBe(200);
    expect((await enabled.json()) as { channel: string; isEnabled: boolean }).toMatchObject({ channel: 'SMS', isEnabled: true });
    expect(await channelOf('SMS')).toMatchObject({ isEnabled: true });

    const disabled = await mutate(ctx, 'put', `/api/v1/templates/${created.id}/channels/SMS`, { data: { isEnabled: false } });
    expect(disabled.status()).toBe(200);
    expect(await channelOf('SMS'), 'the toggle is an update of the same setting, not a second row').toMatchObject({ isEnabled: false });
  });

  /**
   * `assertContentsRender` strict-renders every draft content block through LiquidJS; a body referencing a
   * variable the template's `variableSchema` never declared fails that render and maps to `TPL_PUB_003` (422).
   */
  test('should reject publishing content that references an undeclared variable with TPL_PUB_003', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const created = await createTemplate(ctx, {
      templateKey: uniqueKey('tpl-undeclared-var'),
      messageType: 'TRANSACTIONAL',
      variableSchema: { variables: { greeting: { type: 'string', required: true, example: 'hello' } } },
    });
    createdTemplateIds.push(created.id);
    await mutate(ctx, 'put', `/api/v1/templates/${created.id}/channels/EMAIL`, { data: { isEnabled: true } });

    await openDraft(ctx, created.id);
    await putDraftContent(ctx, created.id, { channel: 'EMAIL', locale: 'en-ZZ', subject: 'Hi', body: 'Message: {{ never_declared }}' });

    const response = await mutate(ctx, 'post', `/api/v1/templates/${created.id}/versions/draft/publish`, { data: {} });
    expect(response.status()).toBe(422);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('TPL_PUB_003');
  });
});
