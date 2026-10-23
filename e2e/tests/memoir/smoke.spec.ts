import { expect, test } from '@playwright/test';

import { apiContext, requireProductUrl } from '../../lib';

test.describe('memoir smoke', () => {
  test.beforeEach(() => requireProductUrl('memoir'));

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
