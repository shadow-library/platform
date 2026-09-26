import { describe, expect, it } from 'bun:test';

import { AccountSettingsService } from '@modules/ai/account-settings.service';

describe('AccountSettingsService.update', () => {
  it('should refuse a bot principal without writing a row', async () => {
    const writes: unknown[] = [];
    const db = { insert: (table: unknown) => writes.push(table) };
    const actors = { current: () => ({ kind: 'bot', id: 3n, organisationId: 9n }) };
    const service = new AccountSettingsService({ getPostgresClient: () => db } as never, actors as never);

    await expect(service.update({ defaultCostTier: 'economy' })).rejects.toMatchObject({ code: 'AI_016' });
    expect(writes).toHaveLength(0);
  });
});
