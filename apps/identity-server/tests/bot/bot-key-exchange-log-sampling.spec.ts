import { describe, expect, it, spyOn } from 'bun:test';
import { randomBytes } from 'node:crypto';

import { FakeDatabaseService, InMemoryRedis } from '@shadow-library/modules/testing';

import { BotKeyExchangeService } from '@server/modules/identity/bot/bot-key-exchange.service';
import { formatBotKey } from '@server/modules/identity/bot/bot-key.util';
import { LogSamplerService } from '@server/modules/infrastructure/security/log-sampler.service';

interface KeyRecordStub {
  secretHash: string;
}

class UnreachableRedis extends InMemoryRedis {
  override set(): Promise<'OK' | null> {
    return Promise.reject(new Error('redis down'));
  }
}

const serviceWith = (redis: InMemoryRedis, records: KeyRecordStub[] = []): BotKeyExchangeService => {
  const query = { from: () => query, innerJoin: () => query, where: () => query, limit: () => Promise.resolve(records) };
  const databaseService = new FakeDatabaseService({ postgres: { select: () => query }, redis });
  return new BotKeyExchangeService(databaseService, {} as never, {} as never, new LogSamplerService(databaseService));
};

describe('BotKeyExchangeService log sampling', () => {
  it('should keep refusing and still log when Redis is unavailable', async () => {
    const service = serviceWith(new UnreachableRedis(), [{ secretHash: '0'.repeat(64) }]);
    const warn = spyOn(service['logger'], 'warn');

    expect(await service.authenticate('sl_bot_malformed', '198.51.100.7', 'exchange')).toEqual({ status: 'denied' });
    expect(await service.authenticate(formatBotKey(Bun.randomUUIDv7(), randomBytes(32)), '198.51.100.7', 'direct')).toEqual({ status: 'denied' });

    const reasons = warn.mock.calls.map(([, meta]) => (meta as { reason: string }).reason);
    expect(reasons).toEqual(['malformed', 'secret_mismatch']);
    warn.mockRestore();
  });

  it('should sample each refusal reason separately per caller address', async () => {
    const service = serviceWith(new InMemoryRedis());
    const warn = spyOn(service['logger'], 'warn');
    const unknownKey = () => formatBotKey(Bun.randomUUIDv7(), randomBytes(32));

    for (const key of ['sl_bot_malformed', 'sl_bot_malformed', unknownKey(), unknownKey()]) await service.authenticate(key, '198.51.100.7', 'exchange');
    await service.authenticate('sl_bot_malformed', '198.51.100.8', 'exchange');

    const logged = warn.mock.calls.map(([, meta]) => `${(meta as { ip: string }).ip}:${(meta as { reason: string }).reason}`);
    expect(logged).toEqual(['198.51.100.7:malformed', '198.51.100.7:not_found', '198.51.100.8:malformed']);
    warn.mockRestore();
  });
});
