/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { PolicyDecisionService } from '@server/modules/authz';
import { UserService } from '@server/modules/identity/user';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('authz').init();

describe('PolicyDecisionService', () => {
  let pdp: PolicyDecisionService;
  let applicationId: number;
  let roleId: number;
  let orgId: string;
  let userId: string;

  beforeEach(async () => {
    pdp = env.getService(PolicyDecisionService);
    applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
    const role = await env.getService(ApplicationRoleService).addRole('shadow-identity', { roleName: `editor-${Date.now()}` });
    roleId = role.id;
    const user = await env.getService(UserService).createUserWithPassword({ email: 'pdp@example.com', password: 'Password@123', status: 'ACTIVE' });
    userId = user.id.toString();
    orgId = String(user.personalOrganisationId);

    const permissionId = await pdp.createPermission(applicationId, 'posts:write');
    await pdp.grantPermissionToRole(roleId, permissionId);
  });

  const principal = () => ({ type: 'USER' as const, id: userId });

  it('should deny by default when the principal has no roles', async () => {
    const decision = await pdp.check({ principal: principal(), organisationId: orgId, action: 'posts:write' });
    expect(decision.decision).toBe('DENY');
  });

  it('should permit an action granted through an assigned role', async () => {
    await pdp.assignRole(principal(), roleId, orgId);
    const decision = await pdp.check({ principal: principal(), organisationId: orgId, action: 'posts:write' });
    expect(decision.decision).toBe('PERMIT');
  });

  it('should not permit an action outside the granted permissions', async () => {
    await pdp.assignRole(principal(), roleId, orgId);
    const decision = await pdp.check({ principal: principal(), organisationId: orgId, action: 'posts:delete' });
    expect(decision.decision).toBe('DENY');
  });

  it('should scope decisions to the organisation of the assignment', async () => {
    await pdp.assignRole(principal(), roleId, orgId);
    const decision = await pdp.check({ principal: principal(), organisationId: '999999', action: 'posts:write' });
    expect(decision.decision).toBe('DENY');
  });

  it('should bump the authz version on grant changes for cache invalidation', async () => {
    const before = await pdp.getAuthzVersion(principal());
    await pdp.assignRole(principal(), roleId, orgId);
    const after = await pdp.getAuthzVersion(principal());
    expect(after).toBeGreaterThan(before);
  });

  it('should serve decisions over the HTTP PDP endpoint', async () => {
    await pdp.assignRole(principal(), roleId, orgId);
    const response = await env
      .getRouter()
      .mockRequest()
      .post('/api/v1/authz/check')
      .body({ principalType: 'USER', principalId: userId, organisationId: orgId, action: 'posts:write' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ decision: 'PERMIT' });
  });

  it('should revoke a role and deny thereafter', async () => {
    await pdp.assignRole(principal(), roleId, orgId);
    await pdp.revokeRole(principal(), roleId, orgId);
    const decision = await pdp.check({ principal: principal(), organisationId: orgId, action: 'posts:write' });
    expect(decision.decision).toBe('DENY');
  });
});
