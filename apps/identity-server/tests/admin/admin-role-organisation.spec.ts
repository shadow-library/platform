import { beforeEach, describe, expect, it } from 'bun:test';

import { ADMIN_PERMISSIONS, IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

interface AssignmentItem {
  principalType: string;
  principalId: string;
  organisationId: string;
}

const env = new TestEnvironment('admin-role-org').init();

describe('Admin ORGANISATION role assignments', () => {
  let adminSecret: string;
  let platformOrgId: string;
  let tierAppId: number;
  let premiumRoleId: number;
  let teamOrgId: string;
  let seq = 0;

  const uniq = (): string => `${Date.now()}-${seq++}`;

  const request = (method: 'get' | 'post', path: string, cookie = adminSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  const platformAdminSession = async (): Promise<string> => {
    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    const admin = await env
      .getService(UserService)
      .createUserWithPassword({ email: `org-admin-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.id.toString() }, role?.id ?? 0, platformOrgId);
    return (await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL2' })).secret;
  };

  beforeEach(async () => {
    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    platformOrgId = String(organisation?.id);

    const tierApp = await env.getService(ApplicationService).createApplication({ name: `tier-${uniq()}`, subDomain: `t${uniq()}` });
    tierAppId = tierApp.id;
    premiumRoleId = (await env.getService(ApplicationRoleService).addRole(tierApp.name, { roleName: 'premium' })).id;
    teamOrgId = (await env.getService(OrganisationService).ensureTeamOrganisation(`Team ${uniq()}`)).id.toString();

    adminSecret = await platformAdminSession();
  });

  const assign = (body: Record<string, unknown>, cookie = adminSecret) => request('post', '/api/v1/admin/role-assignments', cookie).body(body);

  it('should grant an org-wide role to a live team organisation and render it in the list', async () => {
    const response = await assign({ principalType: 'ORGANISATION', principalId: teamOrgId, roleId: premiumRoleId, organisationId: teamOrgId });
    expect(response.statusCode).toBe(200);

    const list = await request('get', `/api/v1/admin/role-assignments?principalType=ORGANISATION&principalId=${teamOrgId}`);
    const items = (list.json() as { items: AssignmentItem[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ principalType: 'ORGANISATION', principalId: teamOrgId, organisationId: teamOrgId });
  });

  it('should derive the assignment scope from the principal, ignoring a divergent organisationId', async () => {
    const response = await assign({ principalType: 'ORGANISATION', principalId: teamOrgId, roleId: premiumRoleId, organisationId: '1' });
    expect(response.statusCode).toBe(200);

    const list = await request('get', `/api/v1/admin/role-assignments?organisationId=${teamOrgId}`);
    const items = (list.json() as { items: AssignmentItem[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0]?.organisationId).toBe(teamOrgId);
  });

  it('should reject an org-wide grant to an unknown organisation', async () => {
    const response = await assign({ principalType: 'ORGANISATION', principalId: '999999', roleId: premiumRoleId, organisationId: '999999' });
    expect(response.statusCode).toBe(404);
  });

  it('should reject an org-wide grant to a personal workspace', async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: `personal-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE' });
    const personalOrgId = (user.personalOrganisationId as bigint).toString();
    const response = await assign({ principalType: 'ORGANISATION', principalId: personalOrgId, roleId: premiumRoleId, organisationId: personalOrgId });
    expect(response.statusCode).toBe(409);
  });

  it('should revoke an org-wide grant', async () => {
    await assign({ principalType: 'ORGANISATION', principalId: teamOrgId, roleId: premiumRoleId, organisationId: teamOrgId });
    const revoked = await request('post', '/api/v1/admin/role-assignments/revoke').body({
      principalType: 'ORGANISATION',
      principalId: teamOrgId,
      roleId: premiumRoleId,
      organisationId: teamOrgId,
    });
    expect(revoked.statusCode).toBe(200);

    const list = await request('get', `/api/v1/admin/role-assignments?principalType=ORGANISATION&principalId=${teamOrgId}`);
    expect((list.json() as { items: AssignmentItem[] }).items).toHaveLength(0);
  });

  describe('two-tier requireRoleAdmin still applies', () => {
    let appAdminSecret: string;

    beforeEach(async () => {
      const pdp = env.getService(PolicyDecisionService);
      const roleAdmin = await env
        .getService(ApplicationRoleService)
        .addRole(env.getService(ApplicationService).getApplicationByIdOrThrow(tierAppId).name, { roleName: 'TierRoleAdmin' });
      const permissionId = await pdp.ensurePermission(tierAppId, ADMIN_PERMISSIONS.appRolesManage);
      await pdp.grantPermissionToRole(roleAdmin.id, permissionId);

      const user = await env
        .getService(UserService)
        .createUserWithPassword({ email: `app-admin-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
      await pdp.assignRole({ type: 'USER', id: user.id.toString() }, roleAdmin.id, platformOrgId);
      appAdminSecret = (await env.getService(SessionService).create({ userId: user.id, aal: 'AAL2' })).secret;
    });

    it('should let an app-scoped admin grant an org-wide role within its own application', async () => {
      const response = await assign({ principalType: 'ORGANISATION', principalId: teamOrgId, roleId: premiumRoleId, organisationId: teamOrgId }, appAdminSecret);
      expect(response.statusCode).toBe(200);
    });

    it('should deny an app-scoped admin granting an org-wide role for another application', async () => {
      const platformApp = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
      const foreignRole = await env.getService(ApplicationRoleService).addRole(platformApp.name, { roleName: `Foreign-${uniq()}` });
      const response = await assign({ principalType: 'ORGANISATION', principalId: teamOrgId, roleId: foreignRole.id, organisationId: teamOrgId }, appAdminSecret);
      expect(response.statusCode).toBe(403);
    });
  });
});
