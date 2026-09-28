import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { FakeDatabaseService, InMemoryRedis } from '@shadow-library/modules/testing';

import { PolicyService } from '@server/modules/system/policy/policy.service';

const EMAIL_OTP = 'mfa.email_otp_fallback.enabled';
const ACCESS_TOKEN_TTL = 'auth.access_token.ttl';
const ORGANISATION = 7n;

function serviceWith(stored: Record<string, unknown>, redis = new InMemoryRedis()): PolicyService {
  const rows = Object.entries(stored).map(([policyKey, policyValue]) => ({ policyKey, policyValue }));
  const query = { from: () => query, where: () => Promise.resolve(rows) };
  return new PolicyService(new FakeDatabaseService({ postgres: { select: () => query }, redis }));
}

describe('PolicyService', () => {
  afterEach(() => mock.restore());

  describe('resolve', () => {
    it('should honour a switch turned off by a string-wrapped boolean instead of failing open', async () => {
      const service = serviceWith({ [EMAIL_OTP]: 'false' });

      expect(await service.resolve(EMAIL_OTP, { organisationIds: [ORGANISATION] })).toBe(false);
    });

    it('should honour a duration stored as a numeric string', async () => {
      const service = serviceWith({ [ACCESS_TOKEN_TTL]: '300' });

      expect(await service.resolve(ACCESS_TOKEN_TTL, { organisationIds: [ORGANISATION] })).toBe(300);
    });

    it('should fold an unreadable switch under AND resolution as off, failing closed', async () => {
      const service = serviceWith({ [EMAIL_OTP]: 'maybe' });
      const error = spyOn(service['logger'], 'error');

      expect(await service.resolve(EMAIL_OTP, { organisationIds: [ORGANISATION] })).toBe(false);
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('should drop an unreadable duration with an error and fall back to the other candidates', async () => {
      const service = serviceWith({ [ACCESS_TOKEN_TTL]: 300.5 });
      const error = spyOn(service['logger'], 'error');

      expect(await service.resolve(ACCESS_TOKEN_TTL, { organisationIds: [ORGANISATION] })).toBe(3600);
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('should coerce an override the cache still holds in its string-wrapped form', async () => {
      const redis = new InMemoryRedis();
      await redis.set(`org_policy:${ORGANISATION}`, JSON.stringify({ [EMAIL_OTP]: 'false' }));

      expect(await serviceWith({}, redis).resolve(EMAIL_OTP, { organisationIds: [ORGANISATION] })).toBe(false);
    });

    it('should report the coerced value as the configured one', async () => {
      const [policy] = (await serviceWith({ [EMAIL_OTP]: 'false' }).listForOrganisation(ORGANISATION)).filter(item => item.key === EMAIL_OTP);

      expect(policy).toMatchObject({ configuredValue: false, effectiveValue: false });
    });
  });
});
