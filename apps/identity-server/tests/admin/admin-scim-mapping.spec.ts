/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ADMIN_PERMISSIONS, IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { csrfPair, TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

interface MappingItem {
  id: string;
  groupId: string;
  roleId: number;
  organisationId: string;
}

/**
 * Declaring the constants
 *
 * The admin group-mapping API (T-905): mutations ride the two-tier `requireRoleAdmin` + AAL2 (D-A8),
 * authorised against the *role's* application, and are guarded by the ORG_011 reachability rule. A
 * create backfills the group's members; a delete revokes only marker rows, never a manual grant.
 */
const env = new TestEnvironment('admin-scim-mapping').init();

describe('Admin SCIM group → role mappings', () => {
  let adminSecret: string;
  let platformOrgId: string;
  let tierAppId: number;
  let premiumRoleId: number;
  let permission: string;
  let orgId: bigint;
  let groupId: string;
  let memberUserId: bigint;
  let seq = 0;

  const uniq = (): string => `${Date.now()}-${seq++}`;

  const request = (method: 'get' | 'post' | 'delete', path: string, cookie = adminSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  const sessionFor = async (roleName: string, applicationName: string, permissionName: string | undefined, aal: 'AAL1' | 'AAL2'): Promise<string> => {
    const pdp = env.getService(PolicyDecisionService);
    const application = env.getService(ApplicationService).getApplicationOrThrow(applicationName);
    const role = application.roles.find(candidate => candidate.roleName === roleName) ?? (await env.getService(ApplicationRoleService).addRole(applicationName, { roleName }));
    if (permissionName) {
      const permissionId = await pdp.ensurePermission(application.id, permissionName);
      await pdp.grantPermissionToRole(role.id, permissionId);
    }
    const user = await env
      .getService(UserService)
      .createUserWithPassword({ email: `admin-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    await pdp.assignRole({ type: 'USER', id: user.id.toString() }, role.id, platformOrgId);
    return (await env.getService(SessionService).create({ userId: user.id, aal })).secret;
  };

  const plainSession = async (aal: 'AAL1' | 'AAL2'): Promise<string> => {
    const user = await env
      .getService(UserService)
      .createUserWithPassword({ email: `plain-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    return (await env.getService(SessionService).create({ userId: user.id, aal })).secret;
  };

  const permits = async (userId: bigint, action = permission): Promise<boolean> => {
    const decision = await env.getService(PolicyDecisionService).check({ principal: { type: 'USER', id: userId.toString() }, organisationId: orgId.toString(), action });
    return decision.decision === 'PERMIT';
  };

  const create = (body: Record<string, unknown>, cookie = adminSecret) => request('post', '/api/v1/admin/scim/group-mappings', cookie).body(body);

  beforeEach(async () => {
    const platform = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    platformOrgId = String(platform?.id);

    const tierApp = await env.getService(ApplicationService).createApplication({ name: `tier-${uniq()}`, subDomain: `t${uniq()}` });
    tierAppId = tierApp.id;
    premiumRoleId = (await env.getService(ApplicationRoleService).addRole(tierApp.name, { roleName: 'premium' })).id;
    permission = `tier:${uniq()}:use`;
    const permissionId = await env.getService(PolicyDecisionService).ensurePermission(tierAppId, permission);
    await env.getService(PolicyDecisionService).grantPermissionToRole(premiumRoleId, permissionId);

    /** A directory group with one member, provisioned straight into the datastore — the admin API is what is under test, not SCIM. */
    const org = await env.getService(OrganisationService).ensureTeamOrganisation(`Team ${uniq()}`);
    orgId = org.id;
    const member = await env
      .getService(UserService)
      .createUserWithPassword({ email: `member-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    memberUserId = member.id;
    const db = env.getPostgresClient();
    const [dir] = await db
      .insert(schema.scimDirectory)
      .values({ organisationId: orgId, userId: member.id, userName: `member-${uniq()}@example.com`, managed: true })
      .returning();
    const [group] = await db
      .insert(schema.scimGroups)
      .values({ organisationId: orgId, displayName: `Group ${uniq()}` })
      .returning();
    groupId = group?.id ?? '';
    await db.insert(schema.scimGroupMembers).values({ groupId, directoryId: dir?.id ?? '' });

    adminSecret = await sessionFor(IAM_ADMIN_ROLE, 'shadow-identity', undefined, 'AAL2');
  });

  it('should create a mapping, backfill members, and list it filtered by org and group', async () => {
    expect(await permits(memberUserId)).toBe(false);

    const response = await create({ groupId, roleId: premiumRoleId });
    expect(response.statusCode).toBe(201);
    expect(response.json() as MappingItem).toMatchObject({ groupId, roleId: premiumRoleId, organisationId: orgId.toString() });
    expect(await permits(memberUserId)).toBe(true);

    const byOrg = await request('get', `/api/v1/admin/scim/group-mappings?organisationId=${orgId}`);
    expect((byOrg.json() as { items: MappingItem[] }).items).toHaveLength(1);
    const byGroup = await request('get', `/api/v1/admin/scim/group-mappings?groupId=${groupId}`);
    expect((byGroup.json() as { items: MappingItem[] }).items[0]).toMatchObject({ groupId, roleId: premiumRoleId });
  });

  it('should be idempotent on a repeated create', async () => {
    const first = await create({ groupId, roleId: premiumRoleId });
    const second = await create({ groupId, roleId: premiumRoleId });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect((second.json() as MappingItem).id).toBe((first.json() as MappingItem).id);
  });

  it('should reject a role whose application the group organisation cannot reach', async () => {
    await env.getService(ApplicationService).updateApplication(env.getService(ApplicationService).getApplicationByIdOrThrow(tierAppId).name, { visibility: 'INTERNAL' });
    const response = await create({ groupId, roleId: premiumRoleId });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { code: string }).code).toBe('ORG_011');
  });

  it('should delete a mapping and revoke the derived grant', async () => {
    const created = await create({ groupId, roleId: premiumRoleId });
    const mappingId = (created.json() as MappingItem).id;
    expect(await permits(memberUserId)).toBe(true);

    const deleted = await request('delete', `/api/v1/admin/scim/group-mappings/${mappingId}`);
    expect(deleted.statusCode).toBe(200);
    expect(await permits(memberUserId)).toBe(false);

    const missing = await request('delete', `/api/v1/admin/scim/group-mappings/${mappingId}`);
    expect(missing.statusCode).toBe(404);
  });

  it('should revoke only marker rows and never a manual grant of the same role', async () => {
    /** A manual grant carries no marker; the sync must leave it untouched when the mapping is deleted. */
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: memberUserId.toString() }, premiumRoleId, orgId.toString(), 'manual');
    const created = await create({ groupId, roleId: premiumRoleId });
    const mappingId = (created.json() as MappingItem).id;

    const deleted = await request('delete', `/api/v1/admin/scim/group-mappings/${mappingId}`);
    expect(deleted.statusCode).toBe(200);
    /** The manual grant survives the mapping delete. */
    expect(await permits(memberUserId)).toBe(true);
    const rows = await env
      .getService(PolicyDecisionService)
      .listAssignments({ principal: { type: 'USER', id: memberUserId.toString() }, organisationId: orgId.toString(), roleId: premiumRoleId });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.grantedBy).toBe('manual');
  });

  describe('authorization matrix', () => {
    it('should deny a non-admin', async () => {
      const response = await create({ groupId, roleId: premiumRoleId }, await plainSession('AAL2'));
      expect(response.statusCode).toBe(403);
    });

    it('should deny an admin without step-up', async () => {
      const response = await create({ groupId, roleId: premiumRoleId }, await sessionFor(IAM_ADMIN_ROLE, 'shadow-identity', undefined, 'AAL1'));
      expect(response.statusCode).toBe(403);
    });

    it('should let an app-scoped admin map a role of its own application', async () => {
      const appAdmin = await sessionFor('TierRoleAdmin', env.getService(ApplicationService).getApplicationByIdOrThrow(tierAppId).name, ADMIN_PERMISSIONS.appRolesManage, 'AAL2');
      const response = await create({ groupId, roleId: premiumRoleId }, appAdmin);
      expect(response.statusCode).toBe(201);
    });

    it('should deny an app-scoped admin mapping a role of a foreign application', async () => {
      const platformApp = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
      const foreignRole = await env.getService(ApplicationRoleService).addRole(platformApp.name, { roleName: `Foreign-${uniq()}` });
      const appAdmin = await sessionFor('TierRoleAdmin', env.getService(ApplicationService).getApplicationByIdOrThrow(tierAppId).name, ADMIN_PERMISSIONS.appRolesManage, 'AAL2');
      const response = await create({ groupId, roleId: foreignRole.id }, appAdmin);
      expect(response.statusCode).toBe(403);
    });
  });
});
