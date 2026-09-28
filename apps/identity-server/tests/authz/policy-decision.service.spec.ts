import { describe, expect, it } from 'bun:test';

import { FakeDatabaseService, InMemoryRedis } from '@shadow-library/modules/testing';

import { PolicyDecisionService } from '@server/modules/authz/policy-decision.service';

const THIRTY_DAYS = 30 * 24 * 60 * 60;

describe('PolicyDecisionService', () => {
  describe('invalidatePrincipal', () => {
    for (const principal of [
      { type: 'USER' as const, id: '11', key: 'authz_version:USER:11' },
      { type: 'SERVICE_ACCOUNT' as const, id: 'bot_0123456789abcdefghijkl', key: 'authz_version:SERVICE_ACCOUNT:bot_0123456789abcdefghijkl' },
      { type: 'ORGANISATION' as const, id: '7', key: 'authz_version:org:7' },
    ]) {
      it(`should bump the ${principal.type} version and let it lapse once no cached decision can still depend on it`, async () => {
        const redis = new InMemoryRedis();
        const service = new PolicyDecisionService(new FakeDatabaseService({ redis }));

        await service.invalidatePrincipal({ type: principal.type, id: principal.id });
        await service.invalidatePrincipal({ type: principal.type, id: principal.id });

        expect(await redis.get(principal.key)).toBe('2');
        expect(await redis.ttl(principal.key)).toBe(THIRTY_DAYS);
      });
    }
  });
});
