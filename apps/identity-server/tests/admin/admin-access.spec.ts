/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ADMIN_PERMISSIONS, AdminAccessService, IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { SessionService, type ValidatedSession } from '@server/modules/auth/session';
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
 *
 * The AccessGuard now owns session resolution and AAL step-up gating (covered end-to-end in the
 * guard and admin HTTP specs); what remains here is AdminAccessService's authorization surface,
 * which the guard delegates to against an already-resolved session.
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

  const sessionFor = async (email: string): Promise<{ userId: bigint; session: ValidatedSession }> => {
    const user = await env.getService(UserService).createUserWithPassword({ email, password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const { secret } = await sessions.create({ userId: user.id, aal: 'AAL2' });
    const session = await sessions.validate(secret);
    expect(session).not.toBeNull();
    return { userId: user.id, session: session as ValidatedSession };
  };

  beforeEach(async () => {
    pdp = env.getService(PolicyDecisionService);
    sessions = env.getService(SessionService);
    access = new AdminAccessService(pdp, env.getService(OrganisationService));

    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    expect(organisation).not.toBeNull();
    platformOrgId = String(organisation?.id);
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
    const { session } = await sessionFor('mortal@example.com');
    const denied = await rejection(access.authorize(session, ADMIN_PERMISSIONS.usersRead));
    expect(denied.code).toBe('ADM_001');
  });

  it('should authorize an administrator holding the permission in the platform organisation', async () => {
    const { userId, session } = await sessionFor('operator@example.com');
    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await pdp.assignRole({ type: 'USER', id: userId.toString() }, role?.id ?? 0, platformOrgId);

    const actor = await access.authorize(session, ADMIN_PERMISSIONS.usersManage);
    expect(actor.organisationId).toBe(platformOrgId);
    expect(actor.session.userId).toBe(userId);
  });

  it('should scope app-level role administration to the owning application', async () => {
    const apps = env.getService(ApplicationService);
    const platformApp = apps.getApplicationOrThrow('shadow-identity');
    const appB = await apps.createApplication({ name: `app-b-${Date.now()}`, subDomain: `b${Date.now()}` });
    const roleB = await env.getService(ApplicationRoleService).addRole(appB.name, { roleName: 'BAdmin' });
    const permissionId = await pdp.ensurePermission(appB.id, ADMIN_PERMISSIONS.appRolesManage);
    await pdp.grantPermissionToRole(roleB.id, permissionId);

    const { userId, session } = await sessionFor('app-admin@example.com');
    await pdp.assignRole({ type: 'USER', id: userId.toString() }, roleB.id, platformOrgId);

    const permitted = await access.requireRoleAdmin(session, appB.id);
    expect(permitted.session.userId).toBe(userId);

    const denied = await rejection(access.requireRoleAdmin(session, platformApp.id));
    expect(denied.code).toBe('ADM_001');
  });
});
