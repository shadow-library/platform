import { beforeEach, describe, expect, it } from 'bun:test';

import { AccessTokenService, OAuthClientService } from '@server/modules/auth/oauth';
import { CatalogSyncService, PolicyDecisionService } from '@server/modules/authz';
import { UserService } from '@server/modules/identity/user';
import { schema } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

const env = new TestEnvironment('catalog-sync').init();

interface BotGrant {
  resource: string;
  level: 'read' | 'write';
  sensitive?: boolean;
}

interface Manifest {
  permissions: { name: string; description?: string }[];
  roles: { name: string; description?: string; permissions: string[]; bot?: BotGrant }[];
  force?: boolean;
}

const manifest = (
  roles: Manifest['roles'] = [{ name: 'editor', permissions: ['posts:write'] }],
  permissions: Manifest['permissions'] = [{ name: 'posts:write' }, { name: 'posts:delete' }],
): Manifest => ({ permissions, roles });

const forced = (roles?: Manifest['roles'], permissions?: Manifest['permissions']): Manifest => ({ ...manifest(roles, permissions), force: true });

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
    const result = await sync.sync(clientId, forced([], [{ name: 'posts:write' }]));
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
    const result = await sync.sync(clientId, forced([]));
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
    await sync.sync(clientId, { permissions: [], roles: [], force: true });
    expect(applications.getApplicationOrThrow('shadow-identity').roles.length).toBe(seeded);
  });

  describe('bot grant metadata', () => {
    const roleNamed = (name: string) => applications.getApplicationByIdOrThrow(applicationId).roles.find(role => role.roleName === name);

    const withBot = (bot?: BotGrant): Manifest => manifest([{ name: 'editor', permissions: ['posts:write'], ...(bot ? { bot } : {}) }]);

    it('should populate the bot columns a role declares', async () => {
      await sync.sync(clientId, withBot({ resource: 'posts', level: 'write', sensitive: true }));
      expect(roleNamed('editor')).toMatchObject({ botGrantable: true, botResource: 'posts', botLevel: 'write', isSensitive: true });
    });

    it('should default sensitivity to false', async () => {
      await sync.sync(clientId, withBot({ resource: 'posts', level: 'read' }));
      expect(roleNamed('editor')).toMatchObject({ botGrantable: true, isSensitive: false });
    });

    it('should reset the bot columns when a later manifest drops the declaration', async () => {
      await sync.sync(clientId, withBot({ resource: 'posts', level: 'write', sensitive: true }));
      await sync.sync(clientId, withBot());
      expect(roleNamed('editor')).toMatchObject({ botGrantable: false, botResource: null, botLevel: null, isSensitive: false });
    });

    it('should reject an empty, padded or over-long resource', async () => {
      await expect(sync.sync(clientId, withBot({ resource: '', level: 'read' }))).rejects.toThrow();
      await expect(sync.sync(clientId, withBot({ resource: ' posts ', level: 'read' }))).rejects.toThrow();
      await expect(sync.sync(clientId, withBot({ resource: 'p'.repeat(65), level: 'read' }))).rejects.toThrow();
    });

    it('should reject an unknown level', async () => {
      await expect(sync.sync(clientId, withBot({ resource: 'posts', level: 'admin' as 'read' }))).rejects.toThrow();
    });

    it('should reject a bot grant on a role carrying no permissions', async () => {
      const roles: Manifest['roles'] = [{ name: 'empty', permissions: [], bot: { resource: 'posts', level: 'read' } }];
      await expect(sync.sync(clientId, manifest(roles))).rejects.toThrow();
      expect(roleNamed('empty')).toBeUndefined();
    });

    it('should allow a permission-less role that declares no bot grant', async () => {
      await sync.sync(
        clientId,
        manifest([
          { name: 'editor', permissions: ['posts:write'] },
          { name: 'empty', permissions: [] },
        ]),
      );
      expect(roleNamed('empty')).toMatchObject({ botGrantable: false });
    });

    it('should reject a write grant that does not carry the read grant’s permissions', async () => {
      const roles: Manifest['roles'] = [
        { name: 'reader', permissions: ['posts:write', 'posts:delete'], bot: { resource: 'posts', level: 'read' } },
        { name: 'writer', permissions: ['posts:write'], bot: { resource: 'posts', level: 'write' } },
      ];
      await expect(sync.sync(clientId, manifest(roles))).rejects.toThrow();
      expect(roleNamed('reader')).toBeUndefined();
    });

    it('should accept a write grant that is a superset of the read grant', async () => {
      const roles: Manifest['roles'] = [
        { name: 'reader', permissions: ['posts:write'], bot: { resource: 'posts', level: 'read' } },
        { name: 'writer', permissions: ['posts:write', 'posts:delete'], bot: { resource: 'posts', level: 'write' } },
      ];
      await sync.sync(clientId, manifest(roles));
      expect(roleNamed('writer')).toMatchObject({ botGrantable: true, botLevel: 'write' });
    });

    it('should reject two roles claiming the same resource and level', async () => {
      const roles: Manifest['roles'] = [
        { name: 'editor', permissions: ['posts:write'], bot: { resource: 'posts', level: 'write' } },
        { name: 'publisher', permissions: ['posts:write'], bot: { resource: 'posts', level: 'write' } },
      ];
      await expect(sync.sync(clientId, manifest(roles))).rejects.toThrow();
    });

    it('should leave the seeded shadow-identity bot roles untouched', async () => {
      const before = applications.getApplicationOrThrow('shadow-identity').roles.filter(role => role.botGrantable);
      expect(before.length).toBeGreaterThan(0);

      await sync.sync(clientId, withBot({ resource: 'members', level: 'write' }));
      await sync.sync(clientId, { permissions: [], roles: [], force: true });

      const after = applications.getApplicationOrThrow('shadow-identity').roles.filter(role => role.botGrantable);
      expect(after.map(role => `${role.roleName}:${role.botResource}:${role.botLevel}`).sort()).toEqual(
        before.map(role => `${role.roleName}:${role.botResource}:${role.botLevel}`).sort(),
      );
    });
  });

  describe('deletion guardrail', () => {
    it('should refuse a manifest deleting more than half of the permissions', async () => {
      await sync.sync(clientId, manifest([{ name: 'editor', permissions: ['posts:write'] }], [{ name: 'posts:write' }, { name: 'posts:delete' }, { name: 'posts:read' }]));
      await expect(sync.sync(clientId, manifest([{ name: 'editor', permissions: ['posts:write'] }], [{ name: 'posts:write' }]))).rejects.toThrow();

      const permissions = await pdp.listPermissionsForApplication(applicationId);
      expect(permissions.map(permission => permission.name).sort()).toEqual(['posts:delete', 'posts:read', 'posts:write']);
    });

    it('should refuse a manifest deleting more than half of the roles', async () => {
      const roles = [
        { name: 'editor', permissions: ['posts:write'] },
        { name: 'reviewer', permissions: ['posts:write'] },
        { name: 'admin', permissions: ['posts:delete'] },
      ];
      await sync.sync(clientId, manifest(roles));
      await expect(sync.sync(clientId, manifest([{ name: 'editor', permissions: ['posts:write'] }]))).rejects.toThrow();
      expect(applications.getApplicationByIdOrThrow(applicationId).roles.length).toBe(3);
    });

    it('should allow a manifest deleting exactly half without force', async () => {
      await sync.sync(clientId, manifest([{ name: 'editor', permissions: ['posts:write'] }], [{ name: 'posts:write' }, { name: 'posts:delete' }]));
      const result = await sync.sync(clientId, manifest([{ name: 'editor', permissions: ['posts:write'] }], [{ name: 'posts:write' }]));
      expect(result.permissionsDeleted).toBe(1);
    });

    it('should proceed and audit when the same manifest carries force', async () => {
      await sync.sync(clientId, manifest());
      const result = await sync.sync(clientId, { permissions: [], roles: [], force: true });
      expect(result).toMatchObject({ permissionsDeleted: 2, rolesDeleted: 1 });
      expect(await pdp.listPermissionsForApplication(applicationId)).toEqual([]);
    });

    it('should record a refusal in the audit chain and change nothing', async () => {
      await sync.sync(clientId, manifest());
      const db = env.getPostgresClient();
      const before = await db.select().from(schema.auditEvents);
      await expect(sync.sync(clientId, { permissions: [], roles: [] })).rejects.toThrow();

      const after = await db.select().from(schema.auditEvents);
      expect(after.length).toBe(before.length + 1);
      expect(after.at(-1)).toMatchObject({ action: 'authz.catalog.sync_refused', outcome: 'DENIED', actorId: clientId });
      expect((await pdp.listPermissionsForApplication(applicationId)).length).toBe(2);
    });
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

    it('should answer 409 for a guardrail refusal and 200 once force is set', async () => {
      await sync.sync(clientId, manifest());
      const truncate = (body: Manifest) =>
        env
          .getRouter()
          .mockRequest()
          .put('/api/v1/authz/catalog')
          .headers({ authorization: `Bearer ${serviceToken()}` })
          .body(body);

      const refused = await truncate({ permissions: [], roles: [] });
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ code: 'AUTHZ_004' });

      expect((await truncate({ permissions: [], roles: [], force: true })).statusCode).toBe(200);
    });
  });
});
