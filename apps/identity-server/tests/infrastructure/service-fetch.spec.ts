import { describe, expect, it } from 'bun:test';

import { serviceFetchFrom } from '@server/modules/infrastructure/service-token';

class FakeTokens {
  readonly invalidated: string[] = [];
  private minted = 0;

  getToken(audience: string, scope: string): Promise<string> {
    return Promise.resolve(`${audience}|${scope}|${++this.minted}`);
  }

  invalidate(audience: string, scope: string): void {
    this.invalidated.push(`${audience}|${scope}`);
  }
}

function recordingTransport(...statuses: number[]): { transport: (url: string, init: RequestInit) => Promise<Response>; bearers: string[] } {
  const bearers: string[] = [];
  const transport = (_url: string, init: RequestInit): Promise<Response> => {
    bearers.push(new Headers(init.headers).get('authorization') ?? '');
    return Promise.resolve(new Response(null, { status: statuses.shift() ?? 200 }));
  };
  return { transport, bearers };
}

describe('serviceFetchFrom', () => {
  it('should send a token minted for the requested audience and scopes', async () => {
    const tokens = new FakeTokens();
    const { transport, bearers } = recordingTransport(200);
    const response = await serviceFetchFrom(tokens, transport)('http://pulse-server/x', { method: 'POST' }, { resource: 'api://pulse', scopes: ['notifications:send'] });

    expect(response.status).toBe(200);
    expect(bearers).toEqual(['Bearer api://pulse|notifications:send|1']);
    expect(tokens.invalidated).toEqual([]);
  });

  it('should drop a rejected token and retry once with a fresh one', async () => {
    for (const rejection of [401, 403]) {
      const tokens = new FakeTokens();
      const { transport, bearers } = recordingTransport(rejection, 200);
      const response = await serviceFetchFrom(tokens, transport)('http://app-server/x', {}, { resource: 'api://app', scopes: ['app:bots:manage'] });

      expect(response.status).toBe(200);
      expect(bearers).toEqual(['Bearer api://app|app:bots:manage|1', 'Bearer api://app|app:bots:manage|2']);
      expect(tokens.invalidated).toEqual(['api://app|app:bots:manage']);
    }
  });

  it('should answer the second rejection rather than retry again', async () => {
    const { transport, bearers } = recordingTransport(401, 401);
    expect((await serviceFetchFrom(new FakeTokens(), transport)('http://app-server/x', {}, { resource: 'api://app', scopes: ['s'] })).status).toBe(401);
    expect(bearers).toHaveLength(2);
  });
});
