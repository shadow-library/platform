/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { PolicyService } from '@server/modules/system/policy';

import { csrfPair, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('org-policy').init();

describe('PolicyService', () => {
  let organisationId: bigint;
  let otherOrganisationId: bigint;
  let policyService: PolicyService;

  const createOrganisation = async (email: string) => {
    const user = await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    return user.personalOrganisationId as bigint;
  };

  beforeEach(async () => {
    policyService = env.getService(PolicyService);
    organisationId = await createOrganisation('policy-one@example.com');
    otherOrganisationId = await createOrganisation('policy-two@example.com');
  });

  it('should fall back to the platform default when nothing is configured', async () => {
    expect(await policyService.resolve('auth.access_token.ttl', { organisationIds: [organisationId] })).toBe(3600);
  });

  it('should honour an organisation override', async () => {
    await policyService.set(organisationId, 'auth.access_token.ttl', 900);
    expect(await policyService.resolve('auth.access_token.ttl', { organisationIds: [organisationId] })).toBe(900);
  });

  it('should let an organisation tighten a lifetime but never extend one', async () => {
    await policyService.set(organisationId, 'auth.access_token.ttl', 7200);
    /** The registry default is stricter, and `MIN` keeps the stricter of the two. */
    expect(await policyService.resolve('auth.access_token.ttl', { organisationIds: [organisationId] })).toBe(3600);
  });

  it('should apply the strictest policy across every organisation involved', async () => {
    await policyService.set(organisationId, 'auth.access_token.ttl', 1800);
    await policyService.set(otherOrganisationId, 'auth.access_token.ttl', 600);
    expect(await policyService.resolve('auth.access_token.ttl', { organisationIds: [organisationId, otherOrganisationId] })).toBe(600);
  });

  it('should fold a client-level value in alongside the organisation policies', async () => {
    await policyService.set(organisationId, 'auth.access_token.ttl', 1800);
    expect(await policyService.resolve('auth.access_token.ttl', { organisationIds: [organisationId], clientValue: 300 })).toBe(300);
  });

  it('should restore the default once an override is cleared', async () => {
    await policyService.set(organisationId, 'auth.access_token.ttl', 900);
    await policyService.clear(organisationId, 'auth.access_token.ttl');
    expect(await policyService.resolve('auth.access_token.ttl', { organisationIds: [organisationId] })).toBe(3600);
  });

  it('should reject an unknown key and an out-of-bounds or non-integer value', async () => {
    /** The registry is the gate that stops a generic key/value table becoming untyped configuration. */
    const setUnknown = policyService.set as (organisationId: bigint, key: string, value: number) => Promise<void>;
    expect(setUnknown(organisationId, 'auth.nonexistent', 60)).rejects.toThrow();
    expect(policyService.set(organisationId, 'auth.access_token.ttl', 1)).rejects.toThrow();
    expect(policyService.set(organisationId, 'auth.access_token.ttl', 10.5)).rejects.toThrow();
  });

  /**
   * `mfa.email_otp_fallback.enabled` is the first boolean key (T-808, D-20). Booleans fold with
   * `AND`, which is `MIN`'s analogue: an organisation may refuse the fallback but never re-enable it
   * over another organisation's refusal.
   */
  describe('boolean policies', () => {
    it('should default the email-OTP fallback to enabled', async () => {
      expect(await policyService.resolve('mfa.email_otp_fallback.enabled', { organisationIds: [organisationId] })).toBe(true);
    });

    it('should let an organisation disable the fallback', async () => {
      await policyService.set(organisationId, 'mfa.email_otp_fallback.enabled', false);
      expect(await policyService.resolve('mfa.email_otp_fallback.enabled', { organisationIds: [organisationId] })).toBe(false);
    });

    it('should let any applicable organisation veto the fallback', async () => {
      await policyService.set(organisationId, 'mfa.email_otp_fallback.enabled', true);
      await policyService.set(otherOrganisationId, 'mfa.email_otp_fallback.enabled', false);
      expect(await policyService.resolve('mfa.email_otp_fallback.enabled', { organisationIds: [organisationId, otherOrganisationId] })).toBe(false);
    });

    it('should restore the default once the override is cleared', async () => {
      await policyService.set(organisationId, 'mfa.email_otp_fallback.enabled', false);
      await policyService.clear(organisationId, 'mfa.email_otp_fallback.enabled');
      expect(await policyService.resolve('mfa.email_otp_fallback.enabled', { organisationIds: [organisationId] })).toBe(true);
    });

    it('should reject a numeric value for a boolean key', async () => {
      const setMistyped = policyService.set as (organisationId: bigint, key: string, value: unknown) => Promise<void>;
      expect(setMistyped(organisationId, 'mfa.email_otp_fallback.enabled', 0)).rejects.toThrow();
    });

    it('should read the wire field its declared type names, and refuse the other one', () => {
      expect(policyService.selectValue('mfa.email_otp_fallback.enabled', { enabled: false })).toBe(false);
      expect(policyService.selectValue('auth.access_token.ttl', { value: 900 })).toBe(900);
      expect(() => policyService.selectValue('mfa.email_otp_fallback.enabled', { value: 900 })).toThrow();
      expect(() => policyService.selectValue('auth.access_token.ttl', { enabled: true })).toThrow();
      expect(() => policyService.selectValue('auth.access_token.ttl', {})).toThrow();
    });

    it('should describe a boolean key with the enabled trio and no numeric fields', async () => {
      await policyService.set(organisationId, 'mfa.email_otp_fallback.enabled', false);
      const policy = (await policyService.listForOrganisation(organisationId)).find(candidate => candidate.key === 'mfa.email_otp_fallback.enabled');
      expect(policy).toMatchObject({ type: 'boolean', defaultValue: true, effectiveValue: false, configuredValue: false });
      expect(policy?.min).toBeUndefined();
      expect(policy?.max).toBeUndefined();
    });
  });

  it('should describe every registered policy for the admin console', async () => {
    await policyService.set(organisationId, 'auth.refresh_token.idle_ttl', 86_400);
    const policies = await policyService.listForOrganisation(organisationId);

    const refresh = policies.find(policy => policy.key === 'auth.refresh_token.idle_ttl');
    expect(refresh?.configuredValue).toBe(86_400);
    expect(refresh?.effectiveValue).toBe(86_400);

    const access = policies.find(policy => policy.key === 'auth.access_token.ttl');
    expect(access?.configuredValue).toBeNull();
    expect(access?.effectiveValue).toBe(3600);
  });

  /** The wire is where a boolean is most easily lost — the previous shape would have emitted `1`. */
  describe('over the HTTP policy surface', () => {
    let ownerSecret: string;
    let teamId: string;

    const request = (method: 'get' | 'put', path: string, body?: Record<string, unknown>) => {
      const csrf = csrfPair();
      const base = env.getRouter().mockRequest()[method](path);
      const chain = base.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: ownerSecret, 'csrf-token': csrf.cookie });
      return body ? chain.body(body) : chain;
    };

    beforeEach(async () => {
      const owner = await env
        .getService(UserService)
        .createUserWithPassword({ email: 'policy-owner@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
      ownerSecret = (await env.getService(SessionService).create({ userId: owner.id, aal: 'AAL2' })).secret;
      teamId = (await env.getService(OrganisationService).createTeam(owner.id, { name: 'Policy Team' })).id.toString();
    });

    it('should round-trip a boolean policy as a boolean, never as a number', async () => {
      expect((await request('put', `/api/v1/organisations/${teamId}/policies/mfa.email_otp_fallback.enabled`, { enabled: false })).statusCode).toBe(200);

      const listed = await request('get', `/api/v1/organisations/${teamId}/policies`);
      const policies = (listed.json() as { policies: Record<string, unknown>[] }).policies;
      const fallback = policies.find(policy => policy.key === 'mfa.email_otp_fallback.enabled');
      expect(fallback).toMatchObject({ type: 'boolean', defaultEnabled: true, effectiveEnabled: false, configuredEnabled: false });
      expect(fallback).not.toHaveProperty('effectiveValue');

      const ttl = policies.find(policy => policy.key === 'auth.access_token.ttl');
      expect(ttl).toMatchObject({ type: 'integer', effectiveValue: 3600 });
      expect(ttl).not.toHaveProperty('effectiveEnabled');
    });

    it('should refuse a write carrying the field the key does not read', async () => {
      expect((await request('put', `/api/v1/organisations/${teamId}/policies/mfa.email_otp_fallback.enabled`, { value: 900 })).statusCode).toBe(400);
      expect((await request('put', `/api/v1/organisations/${teamId}/policies/auth.access_token.ttl`, { enabled: true })).statusCode).toBe(400);
    });
  });
});
