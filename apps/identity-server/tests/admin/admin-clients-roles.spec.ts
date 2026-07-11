/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ADMIN_PERMISSIONS, IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { SESSION_COOKIE_NAME, SessionService } from '@server/modules/auth/session';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { TestEnvironment, csrfPair } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('admin-clients').init();

describe('Admin client, resource and role APIs', () => {
  let adminSecret: string;
  let platformOrgId: string;
  let platformAppId: number;

  const request = (method: 'get' | 'post' | 'delete' | 'patch', path: string, cookie = adminSecret) => {
    const csrf = csrfPair();
    const chain = env.getRouter().mockRequest()[method](path);
    return chain.headers({ 'x-csrf-token': csrf.header }).cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
  };

  beforeEach(async () => {
    const organisation = await env.getService(OrganisationService).findTeamByName(PLATFORM_ORG_NAME);
    platformOrgId = String(organisation?.id);
    const application = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity');
    platformAppId = application.id;

    const admin = await env.getService(UserService).createUserWithPassword({ email: 'client-admin@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.id.toString() }, role?.id ?? 0, platformOrgId);
    const { secret } = await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL2' });
    adminSecret = secret;
  });

  it('should register a confidential client returning the secret exactly once', async () => {
    const response = await request('post', '/api/v1/admin/clients').body({
      applicationId: platformAppId,
      name: 'Ops Console',
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: true,
      redirectUris: ['https://ops.shadow-apps.com/callback'],
      grantTypes: ['authorization_code', 'refresh_token'],
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { clientId: string; secret?: string };
    expect(body.secret).toBeDefined();

    const detail = await request('get', `/api/v1/admin/clients/${body.clientId}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ name: 'Ops Console', redirectUris: ['https://ops.shadow-apps.com/callback'] });
    expect(JSON.stringify(detail.json())).not.toContain(body.secret);
  });

  it('should reject unknown grant types and unknown applications', async () => {
    const badGrant = await request('post', '/api/v1/admin/clients').body({ applicationId: platformAppId, name: 'X', kind: 'SERVICE', grantTypes: ['implicit'] });
    expect(badGrant.statusCode).toBe(400);

    const badApp = await request('post', '/api/v1/admin/clients').body({ applicationId: 999999, name: 'X', kind: 'SERVICE', grantTypes: ['client_credentials'] });
    expect(badApp.statusCode).toBe(404);
  });

  it('should rotate a secret with an overlap window where both secrets verify', async () => {
    const created = await request('post', '/api/v1/admin/clients').body({ applicationId: platformAppId, name: 'Rotator', kind: 'SERVICE', grantTypes: ['client_credentials'] });
    const { clientId, secret: oldSecret } = created.json() as { clientId: string; secret: string };

    const rotated = await request('post', `/api/v1/admin/clients/${clientId}/rotate-secret`);
    expect(rotated.statusCode).toBe(200);
    const { secret: newSecret } = rotated.json() as { secret: string };
    expect(newSecret).not.toBe(oldSecret);

    const clients = env.getService(OAuthClientService);
    expect(await clients.verifySecret(clientId, newSecret)).toBe(true);
    expect(await clients.verifySecret(clientId, oldSecret)).toBe(true);
  });

  it('should update redirect uris as a full replacement', async () => {
    const created = await request('post', '/api/v1/admin/clients').body({
      applicationId: platformAppId,
      name: 'Updatable',
      kind: 'SPA_PUBLIC',
      redirectUris: ['https://a.example.com/cb'],
      grantTypes: ['authorization_code'],
    });
    const { clientId } = created.json() as { clientId: string };

    const updated = await request('patch', `/api/v1/admin/clients/${clientId}`).body({ redirectUris: ['https://b.example.com/cb'] });
    expect(updated.statusCode).toBe(200);

    const detail = await request('get', `/api/v1/admin/clients/${clientId}`);
    expect(detail.json()).toMatchObject({ redirectUris: ['https://b.example.com/cb'] });
  });

  it('should create resources and scopes, then grant and revoke them on a client', async () => {
    const resource = await request('post', '/api/v1/admin/resources').body({ applicationId: platformAppId, identifier: `res-${Date.now()}`, displayName: 'Test API' });
    expect(resource.statusCode).toBe(201);
    const { id: resourceId } = resource.json() as { id: string };

    const scope = await request('post', `/api/v1/admin/resources/${resourceId}/scopes`).body({ name: 'read', description: 'Read access' });
    expect(scope.statusCode).toBe(201);
    const { id: scopeId } = scope.json() as { id: string };

    const created = await request('post', '/api/v1/admin/clients').body({ applicationId: platformAppId, name: 'Scoped', kind: 'SERVICE', grantTypes: ['client_credentials'] });
    const { clientId } = created.json() as { clientId: string };

    const granted = await request('post', `/api/v1/admin/clients/${clientId}/scopes`).body({ scopeId });
    expect(granted.statusCode).toBe(200);
    let detail = await request('get', `/api/v1/admin/clients/${clientId}`);
    expect((detail.json() as { scopes: string[] }).scopes).toContain('read');

    const revoked = await request('delete', `/api/v1/admin/clients/${clientId}/scopes/${scopeId}`);
    expect(revoked.statusCode).toBe(200);
    detail = await request('get', `/api/v1/admin/clients/${clientId}`);
    expect((detail.json() as { scopes: string[] }).scopes).not.toContain('read');
  });

  it('should manage roles, permissions and assignments over http', async () => {
    const role = await request('post', '/api/v1/admin/roles').body({ applicationId: platformAppId, roleName: `editor-${Date.now()}` });
    expect(role.statusCode).toBe(201);
    const { id: roleId } = role.json() as { id: string };

    const permission = await request('post', '/api/v1/admin/permissions').body({ applicationId: platformAppId, name: `posts:write:${Date.now()}` });
    expect(permission.statusCode).toBe(201);
    const { id: permissionId } = permission.json() as { id: string };

    const granted = await request('post', `/api/v1/admin/roles/${roleId}/permissions`).body({ permissionId });
    expect(granted.statusCode).toBe(200);

    const user = await env.getService(UserService).createUserWithPassword({ email: 'assignee@example.com', password: 'Password@123', status: 'ACTIVE' });
    const assigned = await request('post', '/api/v1/admin/role-assignments').body({
      principalType: 'USER',
      principalId: user.id.toString(),
      roleId: Number(roleId),
      organisationId: platformOrgId,
    });
    expect(assigned.statusCode).toBe(200);

    const list = await request('get', `/api/v1/admin/role-assignments?principalType=USER&principalId=${user.id}`);
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1);

    const revoked = await request('post', '/api/v1/admin/role-assignments/revoke').body({
      principalType: 'USER',
      principalId: user.id.toString(),
      roleId: Number(roleId),
      organisationId: platformOrgId,
    });
    expect(revoked.statusCode).toBe(200);
    const after = await request('get', `/api/v1/admin/role-assignments?principalType=USER&principalId=${user.id}`);
    expect((after.json() as { items: unknown[] }).items).toHaveLength(0);
  });

  it('should reject granting a permission owned by another application', async () => {
    const apps = env.getService(ApplicationService);
    const otherApp = await apps.createApplication({ name: `other-${Date.now()}`, subDomain: `o${Date.now()}` });
    const foreignPermission = await env.getService(PolicyDecisionService).ensurePermission(otherApp.id, 'foreign:perm');

    const role = await request('post', '/api/v1/admin/roles').body({ applicationId: platformAppId, roleName: `mixed-${Date.now()}` });
    const { id: roleId } = role.json() as { id: string };

    const denied = await request('post', `/api/v1/admin/roles/${roleId}/permissions`).body({ permissionId: foreignPermission });
    expect(denied.statusCode).toBe(400);
  });

  it('should let an app-scoped admin manage only their application', async () => {
    const apps = env.getService(ApplicationService);
    const pdp = env.getService(PolicyDecisionService);
    const appB = await apps.createApplication({ name: `scoped-${Date.now()}`, subDomain: `s${Date.now()}` });
    const roleB = await env.getService(ApplicationRoleService).addRole(appB.name, { roleName: 'BAdmin' });
    const scopedPermission = await pdp.ensurePermission(appB.id, ADMIN_PERMISSIONS.appRolesManage);
    await pdp.grantPermissionToRole(roleB.id, scopedPermission);

    const scopedAdmin = await env.getService(UserService).createUserWithPassword({ email: 'scoped-admin@example.com', password: 'Password@123', status: 'ACTIVE' });
    await pdp.assignRole({ type: 'USER', id: scopedAdmin.id.toString() }, roleB.id, platformOrgId);
    const { secret } = await env.getService(SessionService).create({ userId: scopedAdmin.id, aal: 'AAL2' });

    const allowed = await request('post', '/api/v1/admin/roles', secret).body({ applicationId: appB.id, roleName: `sub-${Date.now()}` });
    expect(allowed.statusCode).toBe(201);

    const denied = await request('post', '/api/v1/admin/roles', secret).body({ applicationId: platformAppId, roleName: `nope-${Date.now()}` });
    expect(denied.statusCode).toBe(403);
  });
});
