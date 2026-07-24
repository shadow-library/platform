/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { UserService } from '@server/modules/identity/user';
import { PolicyService } from '@server/modules/system/policy';

import { TestEnvironment } from '../test-environment';

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
});
