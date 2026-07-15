/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AccessTokenService, OAuthClientService } from '@server/modules/auth/oauth';
import { CatalogSyncService, PolicyDecisionService } from '@server/modules/authz';
import { UserService } from '@server/modules/identity/user';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('catalog-sync').init();

interface Manifest {
  permissions: { name: string; description?: string }[];
  roles: { name: string; description?: string; permissions: string[] }[];
}

const manifest = (
  roles: Manifest['roles'] = [{ name: 'editor', permissions: ['posts:write'] }],
  permissions: Manifest['permissions'] = [{ name: 'posts:write' }, { name: 'posts:delete' }],
): Manifest => ({ permissions, roles });

describe('CatalogSyncService', () => {
  let sync: CatalogSyncService;
  let pdp: PolicyDecisionService;
  let applications: ApplicationService;
  let applicationId: number;
  let clientId: string;

  beforeEach(async () => {
    sync = env.getService(CatalogSyncService);
    pdp = env.getService(PolicyDecisionService);
    applications = env.getService(ApplicationService);
    /** A dedicated application so full-sync deletions never touch the seeded platform catalog. */
    const application = await applications.createApplication({ name: `catalog-${Date.now()}`, subDomain: `c${Date.now()}` });
    applicationId = application.id;
    const client = await env.getService(OAuthClientService).register({ applicationId, name: `catalog-svc-${Date.now()}`, kind: 'SERVICE', grantTypes: ['client_credentials'] });
    clientId = client.clientId;
  });

  const editorRoleId = (): number => {
    const role = applications.getApplicationByIdOrThrow(applicationId).roles.find(candidate => candidate.roleName === 'editor');
    if (!role) throw new Error('editor role was not provisioned');
    return role.id;
  };

  it('should create the declared permissions and roles', async () => {
    const result = await sync.sync(clientId, manifest());
    expect(result).toMatchObject({ permissionsUpserted: 2, rolesUpserted: 1, permissionsDeleted: 0, rolesDeleted: 0 });
    const permissions = await pdp.listPermissionsForApplication(applicationId);
    expect(permissions.map(permission => permission.name).sort()).toEqual(['posts:delete', 'posts:write']);
  });

  it('should delete roles and permissions absent from a later manifest (full-sync)', async () => {
    await sync.sync(clientId, manifest());
    const result = await sync.sync(clientId, manifest([], [{ name: 'posts:write' }]));
    expect(result).toMatchObject({ permissionsDeleted: 1, rolesDeleted: 1 });
    const permissions = await pdp.listPermissionsForApplication(applicationId);
    expect(permissions.map(permission => permission.name)).toEqual(['posts:write']);
  });

  it('should reconcile a role’s permission bindings without recreating the role', async () => {
    await sync.sync(clientId, manifest());
    const before = editorRoleId();
    await sync.sync(clientId, manifest([{ name: 'editor', permissions: ['posts:delete'] }]));
    expect(editorRoleId()).toBe(before);

    const user = await env.getService(UserService).createUserWithPassword({ email: `bind-${Date.now()}@example.com`, password: 'Password@123', status: 'ACTIVE' });
    await pdp.assignRole({ type: 'USER', id: user.id.toString() }, before, String(user.personalOrganisationId));
    const write = await pdp.check({ principal: { type: 'USER', id: user.id.toString() }, organisationId: String(user.personalOrganisationId), action: 'posts:write' });
    const del = await pdp.check({ principal: { type: 'USER', id: user.id.toString() }, organisationId: String(user.personalOrganisationId), action: 'posts:delete' });
    expect(write.decision).toBe('DENY');
    expect(del.decision).toBe('PERMIT');
  });

  it('should cascade-remove assignments and invalidate the principal when a role disappears', async () => {
    await sync.sync(clientId, manifest());
    const user = await env.getService(UserService).createUserWithPassword({ email: `cascade-${Date.now()}@example.com`, password: 'Password@123', status: 'ACTIVE' });
    const principal = { type: 'USER' as const, id: user.id.toString() };
    const orgId = String(user.personalOrganisationId);
    await pdp.assignRole(principal, editorRoleId(), orgId);
    expect((await pdp.check({ principal, organisationId: orgId, action: 'posts:write' })).decision).toBe('PERMIT');

    const versionBefore = await pdp.getAuthzVersion(principal);
    const result = await sync.sync(clientId, manifest([]));
    expect(result.rolesDeleted).toBe(1);
    expect(result.principalsInvalidated).toBeGreaterThanOrEqual(1);
    expect((await pdp.check({ principal, organisationId: orgId, action: 'posts:write' })).decision).toBe('DENY');
    expect(await pdp.getAuthzVersion(principal)).toBeGreaterThan(versionBefore);
  });

  it('should reject a manifest whose role references an undeclared permission', async () => {
    await expect(sync.sync(clientId, { permissions: [{ name: 'posts:write' }], roles: [{ name: 'editor', permissions: ['posts:delete'] }] })).rejects.toThrow();
  });

  it('should leave other applications untouched (app-scoped)', async () => {
    const seeded = applications.getApplicationOrThrow('shadow-identity').roles.length;
    await sync.sync(clientId, manifest());
    await sync.sync(clientId, { permissions: [], roles: [] });
    expect(applications.getApplicationOrThrow('shadow-identity').roles.length).toBe(seeded);
  });

  describe('over the HTTP catalog endpoint', () => {
    const serviceToken = (scope = 'authz:roles:sync', subject = clientId) =>
      env.getService(AccessTokenService).mintAccessToken({ subject, audience: 'shadow-identity', scope, clientId: subject, ttlSeconds: 60, actorType: 'service' }).token;

    const call = (token?: string) => {
      const chain = env.getRouter().mockRequest().put('/api/v1/authz/catalog');
      return (token ? chain.headers({ authorization: `Bearer ${token}` }) : chain).body(manifest());
    };

    it('should sync for a service token carrying the roles:sync scope', async () => {
      const response = await call(serviceToken());
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ rolesUpserted: 1, permissionsUpserted: 2 });
    });

    it('should reject an unauthenticated call', async () => {
      expect((await call()).statusCode).toBe(401);
    });

    it('should reject a service token lacking the roles:sync scope', async () => {
      expect((await call(serviceToken('authz:check'))).statusCode).toBe(403);
    });
  });
});
