import { describe, expect, it } from 'bun:test';

import { ClassSchema } from '@shadow-library/class-schema';

import { PolicyKeyParams } from '@server/modules/system/policy/policy.dto';
import { isPolicyKey, POLICY_KEYS } from '@server/modules/system/policy/policy.registry';

const REMOVED_EMAIL_OTP_FALLBACK = 'mfa.email_otp_fallback.enabled';

describe('POLICY_REGISTRY', () => {
  it('should not list the removed email-OTP fallback switch', () => {
    expect(POLICY_KEYS).not.toContain(REMOVED_EMAIL_OTP_FALLBACK);
    expect(isPolicyKey(REMOVED_EMAIL_OTP_FALLBACK)).toBe(false);
  });
});

describe('PolicyKeyParams', () => {
  it('should refuse the removed email-OTP fallback key at validation', () => {
    const policyKey = (ClassSchema.generate(PolicyKeyParams).properties as Record<string, { enum?: string[] }>)['policyKey'];

    expect(policyKey?.enum).toEqual([...POLICY_KEYS]);
    expect(policyKey?.enum).not.toContain(REMOVED_EMAIL_OTP_FALLBACK);
  });
});
