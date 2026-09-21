import { describe, expect, it } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { accessQuery } from '../src/lib/apis/session.api';
import { resolveIsAdmin } from '../src/lib/session';

function clientWith(admin: boolean): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(accessQuery.queryKey, { admin });
  return queryClient;
}

class UnreachableClient extends QueryClient {
  override ensureQueryData(): Promise<never> {
    return Promise.reject(new Error('identity unreachable'));
  }
}

describe('resolveIsAdmin', () => {
  it('should admit a session the server reports as admin', async () => {
    expect(await resolveIsAdmin(clientWith(true))).toBe(true);
  });

  it('should refuse a session the server reports as not admin', async () => {
    expect(await resolveIsAdmin(clientWith(false))).toBe(false);
  });

  it('should refuse when the access check itself fails', async () => {
    expect(await resolveIsAdmin(new UnreachableClient())).toBe(false);
  });
});
