/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { ADMIN_PERMISSIONS, AdminAccessService, IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { SESSION_COOKIE_NAME, SessionAuthService, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('admin-access').init();
const ADMIN_EMAIL = 'admin@shadow-apps.com';

const rejection = <T>(promise: Promise<T>): Promise<any> =>
  promise.then(
    () => ({}),
    error => error,
  );

describe('AdminAccessService', () => {
  let access: AdminAccessService;
  let pdp: PolicyDecisionService;
  let sessions: SessionService;
  let platformOrgId: string;
  let iamAdminRoleId: number;

  const requestWith = (secret: string): FastifyRequest => ({ cookies: { [SESSION_COOKIE_NAME]: secret } }) as unknown as FastifyRequest;

  const createUserSession = async (email: string, aal: 'AAL1' | 'AAL2') => {
    const user = await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const { secret } = await sessions.create({ userId: user.id, aal });
    return { user, secret };
  };

  beforeEach(async () => {
    pdp = env.getService(PolicyDecisionService);
    sessions = env.getService(SessionService);
    access = new AdminAccessService(env.getService(SessionAuthService), pdp, env.getService(OrganisationService));

    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    expect(organisation).not.toBeNull();
    platformOrgId = String(organisation?.id);

    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    expect(role).toBeDefined();
    iamAdminRoleId = role?.id ?? 0;
  });

  it('should grant the bootstrap admin the full permission taxonomy', async () => {
    const admin = await env.getService(UserService).getUser(ADMIN_EMAIL);
    expect(admin).not.toBeNull();
    const principal = { type: 'USER' as const, id: String(admin?.id) };
    for (const permission of Object.values(ADMIN_PERMISSIONS)) {
      const decision = await pdp.check({ principal, organisationId: platformOrgId, action: permission });
      expect(decision.decision).toBe('PERMIT');
    }
  });

  it('should reject a session without administrative assignments', async () => {
    const { secret } = await createUserSession('mortal@example.com', 'AAL2');
    const denied = await rejection(access.requireRead(requestWith(secret), ADMIN_PERMISSIONS.usersRead));
    expect(denied.getCode?.()).toBe('ADM_001');
  });

  it('should reject requests without a session entirely', async () => {
    const denied = await rejection(access.requireRead(requestWith('not-a-session'), ADMIN_PERMISSIONS.usersRead));
    expect(denied.getCode?.()).toBe('AUTH_005');
  });

  it('should permit reads at aal1 but demand step-up for mutations', async () => {
    const { user, secret } = await createUserSession('operator@example.com', 'AAL1');
    await pdp.assignRole({ type: 'USER', id: user.id.toString() }, iamAdminRoleId, platformOrgId);

    const actor = await access.requireRead(requestWith(secret), ADMIN_PERMISSIONS.usersRead);
    expect(actor.organisationId).toBe(platformOrgId);

    const denied = await rejection(access.requireMutation(requestWith(secret), ADMIN_PERMISSIONS.usersManage));
    expect(denied.getCode?.()).toBe('AUTH_006');
  });

  it('should permit mutations for an elevated administrator', async () => {
    const { user, secret } = await createUserSession('elevated@example.com', 'AAL2');
    await pdp.assignRole({ type: 'USER', id: user.id.toString() }, iamAdminRoleId, platformOrgId);
    const actor = await access.requireMutation(requestWith(secret), ADMIN_PERMISSIONS.usersManage);
    expect(actor.session.userId).toBe(user.id);
  });

  it('should scope app-level role administration to the owning application', async () => {
    const apps = env.getService(ApplicationService);
    const platformApp = apps.getApplicationOrThrow('shadow-identity');
    const appB = await apps.createApplication({ name: `app-b-${Date.now()}`, subDomain: `b${Date.now()}` });
    const roleB = await env.getService(ApplicationRoleService).addRole(appB.name, { roleName: 'BAdmin' });
    const permissionId = await pdp.ensurePermission(appB.id, ADMIN_PERMISSIONS.appRolesManage);
    await pdp.grantPermissionToRole(roleB.id, permissionId);

    const { user, secret } = await createUserSession('app-admin@example.com', 'AAL2');
    await pdp.assignRole({ type: 'USER', id: user.id.toString() }, roleB.id, platformOrgId);

    const permitted = await access.requireRoleAdmin(requestWith(secret), appB.id);
    expect(permitted.session.userId).toBe(user.id);

    const denied = await rejection(access.requireRoleAdmin(requestWith(secret), platformApp.id));
    expect(denied.getCode?.()).toBe('ADM_001');
  });
});
