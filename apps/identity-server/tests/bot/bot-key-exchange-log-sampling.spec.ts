import { describe, expect, it, spyOn } from 'bun:test';
import { randomBytes } from 'node:crypto';

import { BotKeyExchangeService, formatBotKey } from '@server/modules/identity/bot';
import { LogSamplerService } from '@server/modules/infrastructure/security';

interface KeyRecordStub {
  secretHash: string;
}

const serviceWith = (redis: { set: (slot: string) => Promise<unknown> }, records: KeyRecordStub[] = []): BotKeyExchangeService => {
  const query = { from: () => query, innerJoin: () => query, where: () => query, limit: () => Promise.resolve(records) };
  const databaseService = { getPostgresClient: () => ({ select: () => query }), getRedisClient: () => redis };
  return new BotKeyExchangeService(databaseService as never, {} as never, {} as never, new LogSamplerService(databaseService as never));
};

describe('BotKeyExchangeService log sampling', () => {
  it('should keep refusing and still log when Redis is unavailable', async () => {
    const service = serviceWith({ set: () => Promise.reject(new Error('redis down')) }, [{ secretHash: '0'.repeat(64) }]);
    const warn = spyOn(service['logger'], 'warn');

    expect(await service.authenticate('sl_bot_malformed', '198.51.100.7', 'exchange')).toEqual({ status: 'denied' });
    expect(await service.authenticate(formatBotKey(Bun.randomUUIDv7(), randomBytes(32)), '198.51.100.7', 'direct')).toEqual({ status: 'denied' });

    const reasons = warn.mock.calls.map(([, meta]) => (meta as { reason: string }).reason);
    expect(reasons).toEqual(['malformed', 'secret_mismatch']);
  });

  it('should sample each refusal reason separately per caller address', async () => {
    const claimed = new Set<string>();
    const redis = {
      set: async (slot: string) => {
        if (claimed.has(slot)) return null;
        claimed.add(slot);
        return 'OK';
      },
    };
    const service = serviceWith(redis, []);
    const warn = spyOn(service['logger'], 'warn');
    const unknownKey = () => formatBotKey(Bun.randomUUIDv7(), randomBytes(32));

    for (const key of ['sl_bot_malformed', 'sl_bot_malformed', unknownKey(), unknownKey()]) await service.authenticate(key, '198.51.100.7', 'exchange');
    await service.authenticate('sl_bot_malformed', '198.51.100.8', 'exchange');

    const logged = warn.mock.calls.map(([, meta]) => `${(meta as { ip: string }).ip}:${(meta as { reason: string }).reason}`);
    expect(logged).toEqual(['198.51.100.7:malformed', '198.51.100.7:not_found', '198.51.100.8:malformed']);
  });
});
