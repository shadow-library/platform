/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AuthClient, CheckPrincipal, createAuthClient } from '@shadow-library/auth';
import { TestIdP, createTestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const AUDIENCE = 'api://pulse';
const ORG = '7';

describe('AuthClient.check (pdp client)', () => {
  let idp: TestIdP;
  let auth: AuthClient;
  let counter = 0;
  let principal: CheckPrincipal;

  beforeAll(async () => {
    idp = await createTestIdP();
    auth = createAuthClient({ issuer: idp.issuer, audience: AUDIENCE });
  });
  afterAll(() => idp.stop());

  const freshPrincipal = (): CheckPrincipal => ({ kind: 'user', sub: `user-${++counter}` });

  it('should deny by default and permit granted actions', async () => {
    principal = freshPrincipal();
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(false);
    idp.grantPermission(principal, ORG, 'posts:write');
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(false);
    idp.bumpAuthzVersion();
    expect(await auth.check({ action: 'posts:read', organisationId: ORG, principal })).toBe(false);
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(true);
  });

  it('should deny when no organisation can be resolved', async () => {
    expect(await auth.check({ action: 'posts:write', principal: freshPrincipal() })).toBe(false);
  });

  it('should fall back to the principal organisation', async () => {
    principal = freshPrincipal();
    const withOrg = { ...principal, org: ORG };
    idp.grantPermission(principal, ORG, 'posts:write');
    expect(await auth.check({ action: 'posts:write', principal: withOrg })).toBe(true);
  });

  it('should cache decisions within the ttl', async () => {
    principal = freshPrincipal();
    idp.grantPermission(principal, ORG, 'posts:write');
    const before = idp.getRequestCount('/api/v1/authz/check');
    await auth.check({ action: 'posts:write', organisationId: ORG, principal });
    await auth.check({ action: 'posts:write', organisationId: ORG, principal });
    await auth.check({ action: 'posts:write', organisationId: ORG, principal });
    expect(idp.getRequestCount('/api/v1/authz/check')).toBe(before + 1);
  });

  it('should discard cached decisions when the authz version bumps', async () => {
    principal = freshPrincipal();
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(false);

    idp.grantPermission(principal, ORG, 'posts:write');
    idp.bumpAuthzVersion();
    // The bump is observed piggybacked on the next uncached response for this principal
    await auth.check({ action: 'posts:read', organisationId: ORG, principal });
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(true);
  });

  it('should batch checks with checkAll', async () => {
    principal = freshPrincipal();
    idp.grantPermission(principal, ORG, 'posts:read');
    const decisions = await auth.checkAll([
      { action: 'posts:read', organisationId: ORG, principal },
      { action: 'posts:delete', organisationId: ORG, principal },
    ]);
    expect(decisions).toEqual([true, false]);
  });

  it('should fail closed on pdp outage unless the caller opted into fail-open', async () => {
    principal = freshPrincipal();
    idp.grantPermission(principal, ORG, 'posts:write');
    idp.setEndpointFailure('/api/v1/authz/check', true);
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(false);
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal }, { failOpen: true })).toBe(true);
    idp.setEndpointFailure('/api/v1/authz/check', false);
  });
});
