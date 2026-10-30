import { describe, expect, it } from 'bun:test';
import { AppError } from '@shadow-library/common';

import { callService, fromAuthClient, type ServiceTarget } from '@shadow-library/internal-api';
import { FakeServiceFetch, jsonResponse } from '@shadow-library/internal-api/testing';

const TARGET: ServiceTarget = { service: 'reader-server', resource: 'api://reader', scopes: ['reader:write'] };

describe('callService', () => {
  it('should resolve the svc:// address and send the target token request', async () => {
    const fake = new FakeServiceFetch();
    await callService(fake.fetch, TARGET, { method: 'GET', path: '/internal/things/1' });

    expect(fake.calls[0]?.url).toBe('http://reader-server/internal/things/1');
    expect(fake.calls[0]?.token).toEqual({ resource: 'api://reader', scopes: ['reader:write'] });
    expect(fake.calls[0]?.headers.get('accept')).toBe('application/json');
  });

  it('should send a JSON body with its content type', async () => {
    const fake = new FakeServiceFetch();
    await callService(fake.fetch, TARGET, { method: 'PUT', path: '/things', body: { name: 'one' } });

    expect(fake.calls[0]?.method).toBe('PUT');
    expect(fake.calls[0]?.headers.get('content-type')).toBe('application/json');
    expect(fake.calls[0]?.body).toEqual({ name: 'one' });
  });

  it('should answer a success with its parsed body', async () => {
    const fake = new FakeServiceFetch(() => jsonResponse(200, { member: true }, { 'x-capabilities': 'a,b' }));
    const response = await callService<{ member: boolean }>(fake.fetch, TARGET, { method: 'GET', path: '/members' });

    expect(response).toMatchObject({ ok: true, status: 200, data: { member: true } });
    expect(response.headers.get('x-capabilities')).toBe('a,b');
  });

  it('should answer a bodiless success with undefined data', async () => {
    const fake = new FakeServiceFetch(() => jsonResponse(204));
    expect(await callService(fake.fetch, TARGET, { method: 'DELETE', path: '/things/1' })).toMatchObject({ ok: true, status: 204, data: undefined });
  });

  it('should answer a refusal as a value carrying the code and message', async () => {
    const fake = new FakeServiceFetch(() => jsonResponse(409, { code: 'WBN_003', message: 'Stale publish rejected', fields: [] }));
    expect(await callService(fake.fetch, TARGET, { method: 'PUT', path: '/things/1' })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: 'WBN_003', message: 'Stale publish rejected' },
    });
  });

  it('should drop an error code or message that is not a string', async () => {
    for (const body of ['not json at all', { code: 42 }, null]) {
      const fake = new FakeServiceFetch(() => jsonResponse(409, body ?? undefined));
      const response = await callService(fake.fetch, TARGET, { method: 'PUT', path: '/things/1' });
      expect(response.ok ? undefined : response.error).toEqual({});
    }
  });

  it('should raise an unreachable service when the call gets no answer', async () => {
    const fake = new FakeServiceFetch(() => Promise.reject(new Error('Unable to connect')));
    const error = await callService(fake.fetch, TARGET, { method: 'GET', path: '/things' }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('INTERNAL_API_SERVICE_UNREACHABLE');
    expect((error as AppError).message).toContain('reader-server');
  });

  it('should rethrow untouched when the caller aborted the call', async () => {
    const controller = new AbortController();
    const abort = new DOMException('aborted', 'AbortError');
    const fake = new FakeServiceFetch(() => {
      controller.abort();
      return Promise.reject(abort);
    });

    expect(await callService(fake.fetch, TARGET, { method: 'GET', path: '/things', signal: controller.signal }).catch((err: unknown) => err)).toBe(abort);
  });
});

describe('fromAuthClient', () => {
  it('should pass the url, init and token request through to the auth client', async () => {
    const seen: unknown[] = [];
    const authClient = { fetch: (...args: unknown[]) => (seen.push(args), Promise.resolve(jsonResponse(200, {}))) };
    const init = { method: 'GET' };
    await fromAuthClient(authClient)('http://reader-server/x', init, { resource: 'api://reader', scopes: ['s'] });

    expect(seen).toEqual([['http://reader-server/x', init, { resource: 'api://reader', scopes: ['s'] }]]);
  });
});
