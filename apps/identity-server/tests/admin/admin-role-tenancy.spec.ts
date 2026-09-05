import { beforeEach, describe, expect, it } from 'bun:test';

import { ADMIN_PERMISSIONS, IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationRoleService, ApplicationService, OrganisationApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

const env = new TestEnvironment('admin-role-tenancy').init();

describe('Admin role-assignment tenancy guards', () => {
  let platformOrgId: string;
  let tierAppId: number;
  let premiumRoleId: number;
  let appAdminSecret: string;
  let seq = 0;

  const uniq = (): string => `${Date.now()}-${seq++}`;

  const request = (method: 'get' | 'post', path: string, cookie: string) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  const assign = (body: Record<string, unknown>, cookie = appAdminSecret) => request('post', '/api/v1/admin/role-assignments', cookie).body(body);
  const revoke = (body: Record<string, unknown>, cookie = appAdminSecret) => request('post', '/api/v1/admin/role-assignments/revoke', cookie).body(body);

  const newUser = async (): Promise<bigint> =>
    (await env.getService(UserService).createUserWithPassword({ email: `member-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE' })).id;

  const teamOrganisation = async (): Promise<string> => (await env.getService(OrganisationService).ensureTeamOrganisation(`Team ${uniq()}`)).id.toString();

  const withoutEntitlement = (organisationId: string): Promise<unknown> =>
    env.getService(OrganisationApplicationService).changeAppAccessMode({ actorId: 'test' }, BigInt(organisationId), { role: 'OWNER', elevated: true }, 'ASSIGNED_ONLY');

  const grantsFor = (principal: { type: 'USER' | 'ORGANISATION'; id: string }): Promise<unknown[]> =>
    env.getService(PolicyDecisionService).listAssignments({ principal, roleId: premiumRoleId });

  const platformAdminSecret = async (): Promise<string> => {
    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    const admin = await env
      .getService(UserService)
      .createUserWithPassword({ email: `platform-admin-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.id.toString() }, role?.id ?? 0, platformOrgId);
    return (await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL2' })).secret;
  };

  beforeEach(async () => {
    const platform = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    platformOrgId = String(platform?.id);

    const tierApp = await env.getService(ApplicationService).createApplication({ name: `tier-${uniq()}`, subDomain: `t${uniq()}` });
    tierAppId = tierApp.id;
    premiumRoleId = (await env.getService(ApplicationRoleService).addRole(tierApp.name, { roleName: 'premium' })).id;

    const pdp = env.getService(PolicyDecisionService);
    const roleAdmin = await env.getService(ApplicationRoleService).addRole(tierApp.name, { roleName: 'TierRoleAdmin' });
    const permissionId = await pdp.ensurePermission(tierAppId, ADMIN_PERMISSIONS.appRolesManage);
    await pdp.grantPermissionToRole(roleAdmin.id, permissionId);

    const admin = await env
      .getService(UserService)
      .createUserWithPassword({ email: `app-admin-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    await pdp.assignRole({ type: 'USER', id: admin.id.toString() }, roleAdmin.id, platformOrgId);
    appAdminSecret = (await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL2' })).secret;
  });

  describe('app-scoped tier', () => {
    it('should deny assigning the role to a user who is not a member of the target organisation', async () => {
      const organisationId = await teamOrganisation();
      const outsider = await newUser();

      const response = await assign({ principalType: 'USER', principalId: outsider.toString(), roleId: premiumRoleId, organisationId });
      expect(response.statusCode).toBe(403);
      expect(await grantsFor({ type: 'USER', id: outsider.toString() })).toHaveLength(0);
    });

    it('should deny assigning the role in an organisation the application is not entitled in', async () => {
      const organisationId = await teamOrganisation();
      const member = await newUser();
      await env.getService(OrganisationService).ensureMember(BigInt(organisationId), member, 'MEMBER');
      await withoutEntitlement(organisationId);

      const response = await assign({ principalType: 'USER', principalId: member.toString(), roleId: premiumRoleId, organisationId });
      expect(response.statusCode).toBe(400);
      expect(await grantsFor({ type: 'USER', id: member.toString() })).toHaveLength(0);
    });

    it('should deny an org-wide grant in an organisation the application is not entitled in', async () => {
      const organisationId = await teamOrganisation();
      await withoutEntitlement(organisationId);

      const response = await assign({ principalType: 'ORGANISATION', principalId: organisationId, roleId: premiumRoleId, organisationId });
      expect(response.statusCode).toBe(400);
      expect(await grantsFor({ type: 'ORGANISATION', id: organisationId })).toHaveLength(0);
    });

    it('should deny assigning the role to a service account where the application is not entitled', async () => {
      const organisationId = await teamOrganisation();
      await withoutEntitlement(organisationId);

      const response = await assign({ principalType: 'SERVICE_ACCOUNT', principalId: 'app_client_tenant-x', roleId: premiumRoleId, organisationId });
      expect(response.statusCode).toBe(400);
    });

    it('should refuse revocation when the application is not entitled in the organisation', async () => {
      const organisationId = await teamOrganisation();
      const member = await newUser();
      await env.getService(OrganisationService).ensureMember(BigInt(organisationId), member, 'MEMBER');
      await withoutEntitlement(organisationId);

      const response = await revoke({ principalType: 'USER', principalId: member.toString(), roleId: premiumRoleId, organisationId });
      expect(response.statusCode).toBe(400);
    });

    it('should allow assigning the role to a member of an organisation the application is entitled in', async () => {
      const organisationId = await teamOrganisation();
      const member = await newUser();
      await env.getService(OrganisationService).ensureMember(BigInt(organisationId), member, 'MEMBER');

      const response = await assign({ principalType: 'USER', principalId: member.toString(), roleId: premiumRoleId, organisationId });
      expect(response.statusCode).toBe(200);

      const grants = await grantsFor({ type: 'USER', id: member.toString() });
      expect(grants).toHaveLength(1);
    });
  });

  describe('platform tier', () => {
    it('should let a platform admin assign the role to a non-member in an organisation the application is not entitled in', async () => {
      const cookie = await platformAdminSecret();
      const organisationId = await teamOrganisation();
      await withoutEntitlement(organisationId);
      const outsider = await newUser();

      const response = await assign({ principalType: 'USER', principalId: outsider.toString(), roleId: premiumRoleId, organisationId }, cookie);
      expect(response.statusCode).toBe(200);
      expect(await grantsFor({ type: 'USER', id: outsider.toString() })).toHaveLength(1);
    });

    it('should let a platform admin revoke a grant after the organisation loses entitlement', async () => {
      const cookie = await platformAdminSecret();
      const organisationId = await teamOrganisation();
      const member = await newUser();
      await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: member.toString() }, premiumRoleId, organisationId);
      await withoutEntitlement(organisationId);

      const response = await revoke({ principalType: 'USER', principalId: member.toString(), roleId: premiumRoleId, organisationId }, cookie);
      expect(response.statusCode).toBe(200);
      expect(await grantsFor({ type: 'USER', id: member.toString() })).toHaveLength(0);
    });
  });
});
