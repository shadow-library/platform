import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { FakeDatabaseService, InMemoryRedis } from '@shadow-library/modules/testing';

import { AppErrorCode } from '@server/classes';
import { type PolicyKey } from '@server/modules/system/policy/policy.registry';
import { PolicyService } from '@server/modules/system/policy/policy.service';

const REMOVED_EMAIL_OTP_FALLBACK = 'mfa.email_otp_fallback.enabled' as PolicyKey;
const ACCESS_TOKEN_TTL = 'auth.access_token.ttl';
const ORGANISATION = 7n;

function serviceWith(stored: Record<string, unknown>, redis = new InMemoryRedis()): PolicyService {
  const rows = Object.entries(stored).map(([policyKey, policyValue]) => ({ policyKey, policyValue }));
  const query = { from: () => query, where: () => Promise.resolve(rows) };
  return new PolicyService(new FakeDatabaseService({ postgres: { select: () => query }, redis }));
}

async function refusal(work: () => unknown): Promise<unknown> {
  return Promise.resolve()
    .then(work)
    .then(
      () => null,
      (error: unknown) => error,
    );
}

describe('PolicyService', () => {
  afterEach(() => mock.restore());

  describe('resolve', () => {
    it('should honour a duration stored as a numeric string', async () => {
      const service = serviceWith({ [ACCESS_TOKEN_TTL]: '300' });

      expect(await service.resolve(ACCESS_TOKEN_TTL, { organisationIds: [ORGANISATION] })).toBe(300);
    });

    it('should drop an unreadable duration with an error and fall back to the other candidates', async () => {
      const service = serviceWith({ [ACCESS_TOKEN_TTL]: 300.5 });
      const error = spyOn(service['logger'], 'error');

      expect(await service.resolve(ACCESS_TOKEN_TTL, { organisationIds: [ORGANISATION] })).toBe(3600);
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('should coerce an override the cache still holds in its string-wrapped form', async () => {
      const redis = new InMemoryRedis();
      await redis.set(`org_policy:${ORGANISATION}`, JSON.stringify({ [ACCESS_TOKEN_TTL]: '300' }));

      expect(await serviceWith({}, redis).resolve(ACCESS_TOKEN_TTL, { organisationIds: [ORGANISATION] })).toBe(300);
    });

    it('should report the coerced value as the configured one', async () => {
      const [policy] = (await serviceWith({ [ACCESS_TOKEN_TTL]: '300' }).listForOrganisation(ORGANISATION)).filter(item => item.key === ACCESS_TOKEN_TTL);

      expect(policy).toMatchObject({ configuredValue: 300, effectiveValue: 300 });
    });

    it('should ignore a stored row of the removed email-OTP fallback switch', async () => {
      const service = serviceWith({ [REMOVED_EMAIL_OTP_FALLBACK]: false, [ACCESS_TOKEN_TTL]: 300 });
      const error = spyOn(service['logger'], 'error');

      expect(await service.resolve(ACCESS_TOKEN_TTL, { organisationIds: [ORGANISATION] })).toBe(300);
      expect((await service.listForOrganisation(ORGANISATION)).map(policy => policy.key)).not.toContain(REMOVED_EMAIL_OTP_FALLBACK);
      expect(error).not.toHaveBeenCalled();
    });

    it('should ignore the removed email-OTP fallback switch in an override a previous release cached', async () => {
      const redis = new InMemoryRedis();
      await redis.set(`org_policy:${ORGANISATION}`, JSON.stringify({ [REMOVED_EMAIL_OTP_FALLBACK]: false, [ACCESS_TOKEN_TTL]: 300 }));
      const service = serviceWith({}, redis);

      expect(await service.resolve(ACCESS_TOKEN_TTL, { organisationIds: [ORGANISATION] })).toBe(300);
      expect((await service.listForOrganisation(ORGANISATION)).map(policy => policy.key)).not.toContain(REMOVED_EMAIL_OTP_FALLBACK);
    });
  });

  describe('writes', () => {
    it('should refuse a value for the removed email-OTP fallback switch as an unknown policy', async () => {
      expect(AppError.is(await refusal(() => serviceWith({}).selectValue(REMOVED_EMAIL_OTP_FALLBACK, { enabled: false })), AppErrorCode.POL_001)).toBe(true);
    });

    it('should refuse to store the removed email-OTP fallback switch as an unknown policy', async () => {
      expect(AppError.is(await refusal(() => serviceWith({}).set(ORGANISATION, REMOVED_EMAIL_OTP_FALLBACK, false as never)), AppErrorCode.POL_001)).toBe(true);
    });

    it('should refuse to clear the removed email-OTP fallback switch as an unknown policy', async () => {
      expect(AppError.is(await refusal(() => serviceWith({}).clear(ORGANISATION, REMOVED_EMAIL_OTP_FALLBACK)), AppErrorCode.POL_001)).toBe(true);
    });
  });
});
