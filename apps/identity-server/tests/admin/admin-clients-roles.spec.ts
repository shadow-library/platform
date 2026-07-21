/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin';
import { OAuthClientService } from '@server/modules/auth/oauth';
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

/**
 * Declaring the constants
 */
const env = new TestEnvironment('admin-clients').init();

describe('Admin client, resource and role APIs', () => {
  let adminSecret: string;
  let adminUserId: bigint;
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
    adminUserId = admin.id;
    const role = application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE);
    await env.getService(PolicyDecisionService).assignRole({ type: 'USER', id: admin.id.toString() }, role?.id ?? 0, platformOrgId);
    const { secret } = await env.getService(SessionService).create({ userId: admin.id, aal: 'AAL2' });
    adminSecret = secret;
  });

  it('should register a confidential client returning the secret exactly once', async () => {
    const response = await request('post', '/api/v1/admin/clients').body({
      clientId: 'ops-console',
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
    const badGrant = await request('post', '/api/v1/admin/clients').body({ clientId: 'bad-grant', applicationId: platformAppId, name: 'X', kind: 'SERVICE', grantTypes: ['implicit'] });
    expect(badGrant.statusCode).toBe(400);

    const badApp = await request('post', '/api/v1/admin/clients').body({ clientId: 'bad-app', applicationId: 999999, name: 'X', kind: 'SERVICE', grantTypes: ['client_credentials'] });
    expect(badApp.statusCode).toBe(404);
  });

  it('should rotate a secret with an overlap window where both secrets verify', async () => {
    const created = await request('post', '/api/v1/admin/clients').body({ clientId: 'rotator', applicationId: platformAppId, name: 'Rotator', kind: 'SERVICE', grantTypes: ['client_credentials'] });
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
      clientId: 'updatable',
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

  it('should update the client name and active state', async () => {
    const created = await request('post', '/api/v1/admin/clients').body({ clientId: 'before-after', applicationId: platformAppId, name: 'Before', kind: 'SERVICE', grantTypes: ['client_credentials'] });
    const { clientId } = created.json() as { clientId: string };

    const updated = await request('patch', `/api/v1/admin/clients/${clientId}`).body({ name: 'After', isActive: false });
    expect(updated.statusCode).toBe(200);

    const detail = await request('get', `/api/v1/admin/clients/${clientId}`);
    expect(detail.json()).toMatchObject({ name: 'After', isActive: false });
  });

  it('should reject a malformed redirect uri on register and on update', async () => {
    const relative = await request('post', '/api/v1/admin/clients').body({
      clientId: 'bad-redirect',
      applicationId: platformAppId,
      name: 'Bad',
      kind: 'SPA_PUBLIC',
      redirectUris: ['not-a-url'],
      grantTypes: ['authorization_code'],
    });
    expect(relative.statusCode).toBe(400);

    const created = await request('post', '/api/v1/admin/clients').body({
      clientId: 'fragmented',
      applicationId: platformAppId,
      name: 'Fragmented',
      kind: 'SPA_PUBLIC',
      redirectUris: ['https://a.example.com/cb'],
      grantTypes: ['authorization_code'],
    });
    const { clientId } = created.json() as { clientId: string };
    const fragment = await request('patch', `/api/v1/admin/clients/${clientId}`).body({ redirectUris: ['https://a.example.com/cb#frag'] });
    expect(fragment.statusCode).toBe(400);
  });

  describe('deletion', () => {
    it('should delete a client and clear its dependents, including non-cascade rows', async () => {
      const created = await request('post', '/api/v1/admin/clients').body({
        clientId: 'disposable',
        applicationId: platformAppId,
        name: 'Disposable',
        kind: 'WEB_CONFIDENTIAL',
        redirectUris: ['https://d.example.com/cb'],
        grantTypes: ['authorization_code', 'refresh_token'],
      });
      const { clientId } = created.json() as { clientId: string };

      /** Seed the two dependents that carry no FK cascade and would otherwise be orphaned by a naive delete. */
      const db = env.getPostgresClient();
      const user = await env.getService(UserService).createUserWithPassword({ email: `consenter-${Date.now()}@example.com`, password: 'Password@123', status: 'ACTIVE' });
      await db.insert(schema.consents).values({ userId: user.id, clientId, scopeNames: ['openid'], source: 'USER' });
      const [family] = await db.insert(schema.refreshTokenFamilies).values({ userId: user.id, clientId }).returning({ id: schema.refreshTokenFamilies.id });
      await db.insert(schema.refreshTokens).values({ familyId: family?.id ?? '', tokenHash: `hash-${Date.now()}`, expiresAt: new Date(Date.now() + 86_400_000) });

      const deleted = await request('delete', `/api/v1/admin/clients/${clientId}`);
      expect(deleted.statusCode).toBe(200);

      const detail = await request('get', `/api/v1/admin/clients/${clientId}`);
      expect(detail.statusCode).toBe(401);

      expect(await db.select().from(schema.consents).where(eq(schema.consents.clientId, clientId))).toHaveLength(0);
      expect(await db.select().from(schema.refreshTokenFamilies).where(eq(schema.refreshTokenFamilies.clientId, clientId))).toHaveLength(0);
      expect(await db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.familyId, family?.id ?? ''))).toHaveLength(0);
    });

    it('should delete a first-party client too (deletion is name-confirmed, not carved out)', async () => {
      const created = await request('post', '/api/v1/admin/clients').body({
        clientId: 'platform-fp',
        applicationId: platformAppId,
        name: 'Platform',
        kind: 'WEB_CONFIDENTIAL',
        isFirstParty: true,
        grantTypes: ['authorization_code'],
      });
      const { clientId } = created.json() as { clientId: string };
      const deleted = await request('delete', `/api/v1/admin/clients/${clientId}`);
      expect(deleted.statusCode).toBe(200);

      const detail = await request('get', `/api/v1/admin/clients/${clientId}`);
      expect(detail.statusCode).toBe(401);
    });

    it('should require a stepped-up session to delete a client', async () => {
      const created = await request('post', '/api/v1/admin/clients').body({ clientId: 'guarded', applicationId: platformAppId, name: 'Guarded', kind: 'SERVICE', grantTypes: ['client_credentials'] });
      const { clientId } = created.json() as { clientId: string };

      const aal1 = (await env.getService(SessionService).create({ userId: adminUserId })).secret;
      const denied = await request('delete', `/api/v1/admin/clients/${clientId}`, aal1);
      expect(denied.statusCode).toBe(403);
    });
  });

  it('should create resources and scopes, then grant and revoke them on a client', async () => {
    const resource = await request('post', '/api/v1/admin/resources').body({ applicationId: platformAppId, identifier: `res-${Date.now()}`, displayName: 'Test API' });
    expect(resource.statusCode).toBe(201);
    const { id: resourceId } = resource.json() as { id: string };

    const scope = await request('post', `/api/v1/admin/resources/${resourceId}/scopes`).body({ name: 'read', description: 'Read access' });
    expect(scope.statusCode).toBe(201);
    const { id: scopeId } = scope.json() as { id: string };

    const created = await request('post', '/api/v1/admin/clients').body({ clientId: 'scoped', applicationId: platformAppId, name: 'Scoped', kind: 'SERVICE', grantTypes: ['client_credentials'] });
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

  it('should assign and revoke a role over http', async () => {
    /** Role and permission definitions are owned by the application (catalog sync), so set them up through the services rather than removed admin endpoints. */
    const role = await env.getService(ApplicationRoleService).addRole('shadow-identity', { roleName: `editor-${Date.now()}` });
    const permissionId = await env.getService(PolicyDecisionService).ensurePermission(platformAppId, `posts:write:${Date.now()}`);
    await env.getService(PolicyDecisionService).grantPermissionToRole(role.id, permissionId);

    const user = await env.getService(UserService).createUserWithPassword({ email: 'assignee@example.com', password: 'Password@123', status: 'ACTIVE' });
    const assigned = await request('post', '/api/v1/admin/role-assignments').body({
      principalType: 'USER',
      principalId: user.id.toString(),
      roleId: role.id,
      organisationId: platformOrgId,
    });
    expect(assigned.statusCode).toBe(200);

    const list = await request('get', `/api/v1/admin/role-assignments?principalType=USER&principalId=${user.id}`);
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1);

    const revoked = await request('post', '/api/v1/admin/role-assignments/revoke').body({
      principalType: 'USER',
      principalId: user.id.toString(),
      roleId: role.id,
      organisationId: platformOrgId,
    });
    expect(revoked.statusCode).toBe(200);
    const after = await request('get', `/api/v1/admin/role-assignments?principalType=USER&principalId=${user.id}`);
    expect((after.json() as { items: unknown[] }).items).toHaveLength(0);
  });

  it('should report the caller’s admin permissions for console gating', async () => {
    const response = await request('get', '/api/v1/admin/context');
    expect(response.statusCode).toBe(200);
    const body = response.json() as { permissions: string[] };
    expect(body.permissions).toContain('iam:clients:manage');
  });

  it('should return no permissions for a non-staff session', async () => {
    const user = await env.getService(UserService).createUserWithPassword({ email: 'not-staff@example.com', password: 'Password@123', status: 'ACTIVE', emailVerified: true });
    const { secret } = await env.getService(SessionService).create({ userId: user.id, aal: 'AAL2' });
    const response = await request('get', '/api/v1/admin/context', secret);
    expect(response.statusCode).toBe(200);
    expect((response.json() as { permissions: string[] }).permissions).toHaveLength(0);
  });

  it('should register a workload-identity client over HTTP without returning a secret', async () => {
    const response = await request('post', '/api/v1/admin/clients').body({
      clientId: 'cluster-job',
      applicationId: platformAppId,
      name: 'Cluster Job',
      kind: 'SERVICE',
      grantTypes: ['client_credentials'],
      authMethod: 'workload_identity',
      workloadSubjects: ['system:serviceaccount:prod:cluster-job'],
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { clientId: string; secret?: string };
    expect(body.secret).toBeUndefined();
    expect(body.clientId).toBe('cluster-job');

    const detail = await request('get', `/api/v1/admin/clients/${body.clientId}`);
    expect((detail.json() as { authMethod: string; workloadSubjects?: string[] }).authMethod).toBe('workload_identity');
    expect((detail.json() as { workloadSubjects?: string[] }).workloadSubjects).toEqual(['system:serviceaccount:prod:cluster-job']);
  });
});
