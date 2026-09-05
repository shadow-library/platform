import { beforeEach, describe, expect, it } from 'bun:test';

import { ADMIN_PERMISSIONS, IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { AccessTokenService, OAuthClientService } from '@server/modules/auth/oauth';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

const env = new TestEnvironment('authz-check').init();

describe('AuthzController', () => {
  let pdp: PolicyDecisionService;
  let platformOrgId: string;
  let callerToken: string;
  let holderId: string;
  let outsiderId: string;
  let seq = 0;

  const uniq = (): string => `${Date.now()}-${seq++}`;

  const serviceToken = (clientId: string): string =>
    env.getService(AccessTokenService).mintAccessToken({ subject: clientId, audience: 'shadow-identity', scope: 'authz:check', clientId, ttlSeconds: 60, actorType: 'service' })
      .token;

  const check = (action: string, principalId = holderId, token = callerToken) =>
    env
      .getRouter()
      .mockRequest()
      .post('/api/v1/authz/check')
      .headers({ authorization: `Bearer ${token}` })
      .body({ principalType: 'USER', principalId, organisationId: platformOrgId, action });

  beforeEach(async () => {
    pdp = env.getService(PolicyDecisionService);
    const applications = env.getService(ApplicationService);
    const applicationRoles = env.getService(ApplicationRoleService);

    const platform = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    platformOrgId = String(platform?.id);

    const callerApp = await applications.createApplication({ name: `authzchk-a-${uniq()}`, subDomain: `a${uniq()}` });
    const callerClient = await env
      .getService(OAuthClientService)
      .register({ applicationId: callerApp.id, name: `authzchk-svc-${uniq()}`, kind: 'SERVICE', grantTypes: ['client_credentials'] });
    callerToken = serviceToken(callerClient.clientId);
    const callerRole = await applicationRoles.addRole(callerApp.name, { roleName: 'readerA' });
    await pdp.grantPermissionToRole(callerRole.id, await pdp.ensurePermission(callerApp.id, 'a:read'));

    const otherApp = await applications.createApplication({ name: `authzchk-b-${uniq()}`, subDomain: `b${uniq()}` });
    const otherRole = await applicationRoles.addRole(otherApp.name, { roleName: 'readerB' });
    await pdp.grantPermissionToRole(otherRole.id, await pdp.ensurePermission(otherApp.id, 'b:read'));

    const iamRole = applications.getApplicationOrThrow('shadow-identity').roles.find(role => role.roleName === IAM_ADMIN_ROLE);

    const holder = await env.getService(UserService).createUserWithPassword({ email: `holder-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE' });
    holderId = holder.id.toString();
    await pdp.assignRole({ type: 'USER', id: holderId }, callerRole.id, platformOrgId);
    await pdp.assignRole({ type: 'USER', id: holderId }, otherRole.id, platformOrgId);
    await pdp.assignRole({ type: 'USER', id: holderId }, iamRole?.id ?? 0, platformOrgId);

    const outsider = await env.getService(UserService).createUserWithPassword({ email: `outsider-${uniq()}@example.com`, password: 'Password@123', status: 'ACTIVE' });
    outsiderId = outsider.id.toString();
  });

  describe('POST /api/v1/authz/check', () => {
    it('should permit a permission of the caller’s own application for a principal that holds it', async () => {
      const response = await check('a:read');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ decision: 'PERMIT' });
    });

    it('should deny a permission of the caller’s own application for a principal that lacks it', async () => {
      const response = await check('a:read', outsiderId);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ decision: 'DENY' });
    });

    it('should deny another application’s permission even for a principal that holds it', async () => {
      expect((await pdp.check({ principal: { type: 'USER', id: holderId }, organisationId: platformOrgId, action: 'b:read' })).decision).toBe('PERMIT');
      const response = await check('b:read');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ decision: 'DENY' });
    });

    it('should deny an iam:* platform-admin permission even for a principal that holds it', async () => {
      expect((await pdp.check({ principal: { type: 'USER', id: holderId }, organisationId: platformOrgId, action: ADMIN_PERMISSIONS.usersRead })).decision).toBe('PERMIT');
      const response = await check(ADMIN_PERMISSIONS.usersRead);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ decision: 'DENY' });
    });

    it('should fail closed when the caller’s client is not bound to an application', async () => {
      const response = await check('a:read', holderId, serviceToken(`unbound-${uniq()}`));
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'AUTHZ_002' });
    });
  });
});
