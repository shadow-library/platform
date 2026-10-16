import { describe, expect, it } from 'bun:test';

import { type CatalogTaskResponse } from '@shadow-library/synapse';
import { AuthGuardErrorCode } from '@shadow-library/auth/module';

import { AppErrorCode } from '@server/classes';

import { CatalogController } from '@modules/admin/catalog.controller';
import { CatalogViewService } from '@modules/admin/catalog-view.service';

import { asPrincipal, BOT, caller, expectFailure, fakeCache, FakeReply, MEMOIR, NOVEL_FORGE, userWith } from './admin.fixtures';

const controller = new CatalogController(caller, new CatalogViewService(fakeCache()));

function get(
  principal: Parameters<typeof asPrincipal>[0],
  query: { task?: string; selectors?: string },
  ifNoneMatch?: string | string[],
): Promise<{ body: unknown; reply: FakeReply }> {
  const reply = new FakeReply();
  const request = { headers: ifNoneMatch === undefined ? {} : { 'if-none-match': ifNoneMatch } };
  return asPrincipal(principal, async () => {
    const body = await controller.getCatalog(query, request as never, reply.asResponse());
    return { body, reply };
  });
}

describe('CatalogController', () => {
  it('should refuse a user principal even though the user would hold the permission', async () => {
    await expectFailure(get(userWith('admin'), { task: 'novel-forge.chat' }), AuthGuardErrorCode.IAM_002);
  });

  it('should refuse a bot and a service that names no client id', async () => {
    await expectFailure(get(BOT, {}), AuthGuardErrorCode.IAM_002);
    await expectFailure(get({ kind: 'service', sub: 'x', scopes: [], claims: {} }, {}), AuthGuardErrorCode.IAM_002);
  });

  it('should answer the calling app with a versioned ETag', async () => {
    const { body, reply } = await get(NOVEL_FORGE, { task: 'novel-forge.chat', selectors: 'tier:economy' });

    expect(reply.headers['etag']).toBe('"v3"');
    expect(reply.headers['cache-control']).toBe('private, no-cache');
    expect(reply.sent).toBe(false);
    expect((body as CatalogTaskResponse).default.model).toBe('grok-4.6');
  });

  it('should take the app from the token, never from the request', async () => {
    const { body } = await get(MEMOIR, {});

    expect(Object.keys((body as { tasks: object }).tasks)).toEqual(['memoir.insight']);
  });

  it('should answer 304 without a body when If-None-Match carries the current ETag', async () => {
    for (const header of ['"v3"', 'W/"v3"', '"v1", "v3"', '*']) {
      const { reply } = await get(NOVEL_FORGE, { task: 'novel-forge.chat' }, header);

      expect(reply.statusCode).toBe(304);
      expect(reply.sent).toBe(true);
      expect(reply.body).toBeUndefined();
      expect(reply.headers['etag']).toBe('"v3"');
    }
  });

  it('should answer a full body when If-None-Match names another version', async () => {
    for (const header of ['"v2"', 'v3', ['"v1"', '"v2"']]) {
      const { reply, body } = await get(NOVEL_FORGE, { task: 'novel-forge.chat' }, header);

      expect(reply.statusCode).toBe(200);
      expect(body).toMatchObject({ catalog_version: 3 });
    }
  });

  it('should still refuse a task of another app when the ETag matches', async () => {
    await expectFailure(get(NOVEL_FORGE, { task: 'memoir.insight' }, '"v3"'), AppErrorCode.SYN_TASK_FORBIDDEN);
  });

  it('should reject malformed selectors with SYN_INVALID_REQUEST', async () => {
    await expectFailure(get(NOVEL_FORGE, { task: 'novel-forge.chat', selectors: 'tier' }), AppErrorCode.SYN_INVALID_REQUEST);
  });
});
