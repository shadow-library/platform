import { afterAll, describe, expect, it, mock } from 'bun:test';

import { setConfig } from '@shadow-library/common/testing';

import { EcosystemSeedService } from '@server/modules/bootstrap/ecosystem-seed.service';
import { ECOSYSTEM_SEED } from '@server/modules/bootstrap/ecosystem-seed.constants';

interface RoleRow {
  id: number;
  roleName: string;
}

const OPERATOR = { adminUserId: 1n, platformOrganisationId: 1n };

const permissionId = (applicationId: number, name: string): string => `${applicationId}:${name}`;

/** Every seeded application, role and service client already exists, as on any boot after the first, except the roles `existingRoles` replaces. */
function seedOver(existingRoles: Record<string, RoleRow[]>) {
  let seededRoleId = 50;
  const declaredRoles = (roles: readonly { name: string }[] = []): RoleRow[] => roles.map(role => ({ id: seededRoleId++, roleName: role.name }));
  const applications = new Map(
    ECOSYSTEM_SEED.applications.map((application, index) => [application.name, { id: index + 10, roles: existingRoles[application.name] ?? declaredRoles(application.roles) }]),
  );
  const catalogue = new Map<string, Set<string>>();
  for (const grant of [...ECOSYSTEM_SEED.applications, ...ECOSYSTEM_SEED.serviceClients].flatMap(entry => entry.grants ?? [])) {
    catalogue.set(grant.resource, (catalogue.get(grant.resource) ?? new Set()).add(grant.scope));
  }

  let nextRoleId = 100;
  const addRole = mock((name: string, role: { roleName: string }) => {
    const created = { id: nextRoleId++, roleName: role.roleName };
    applications.get(name)?.roles.push(created);
    return Promise.resolve(created);
  });
  const ensurePermission = mock((applicationId: number, name: string) => Promise.resolve(permissionId(applicationId, name)));
  const grantPermissionToRole = mock(() => Promise.resolve());
  const assignRole = mock(() => Promise.resolve());

  const applicationService = { getApplication: (name: string) => applications.get(name), getApplicationOrThrow: (name: string) => applications.get(name) };
  const oauthClientService = {
    getClient: (id: string) => Promise.resolve({ id, workloadSubjects: [`system:serviceaccount:${id}:${id}-server`] }),
    listResources: () => Promise.resolve([...catalogue].map(([identifier, scopes]) => ({ identifier, scopes: [...scopes].map(name => ({ name, id: `${identifier}::${name}` })) }))),
    ensureResource: () => Promise.resolve({ id: 1 }),
    createScope: (_resource: number, name: string) => Promise.resolve(`scope:${name}`),
    grantScope: () => Promise.resolve(),
    ensureRedirectUris: () => Promise.resolve(),
    removeRedirectUri: () => Promise.resolve(),
    updateClient: () => Promise.resolve(),
    requireWorkloadIdentity: () => Promise.resolve(false),
  };
  const service = new EcosystemSeedService(
    applicationService as never,
    { addRole } as never,
    oauthClientService as never,
    { ensurePermission, grantPermissionToRole, assignRole } as never,
    { create: () => Promise.resolve() } as never,
  );
  return { service, applications, addRole, ensurePermission, grantPermissionToRole, assignRole };
}

describe('EcosystemSeedService', () => {
  const restoreConfig = setConfig({ 'oauth.issuer': 'https://identity.shadow.test' });
  afterAll(restoreConfig);

  describe('seed', () => {
    it('should add a permission declared after the application already existed and grant it to the roles that declare it', async () => {
      const pulseAdmin = { id: 3, roleName: 'PulseAdmin' };
      const seed = seedOver({ pulse: [{ id: 1, roleName: 'PulseViewer' }, { id: 2, roleName: 'PulseOperator' }, pulseAdmin] });
      const pulseId = seed.applications.get('pulse')?.id ?? 0;

      await seed.service.seed(OPERATOR);

      expect(seed.ensurePermission).toHaveBeenCalledWith(pulseId, 'pulse:messages:read', expect.any(String));
      expect(seed.grantPermissionToRole).toHaveBeenCalledWith(pulseAdmin.id, permissionId(pulseId, 'pulse:messages:read'));
      expect(seed.grantPermissionToRole).not.toHaveBeenCalledWith(1, permissionId(pulseId, 'pulse:messages:read'));
      expect(seed.addRole).not.toHaveBeenCalled();
    });

    it('should add a role declared after the application already existed, assigning it to the bootstrap administrator as its creation does', async () => {
      const seed = seedOver({
        pulse: [
          { id: 1, roleName: 'PulseViewer' },
          { id: 2, roleName: 'PulseOperator' },
        ],
      });

      await seed.service.seed(OPERATOR);

      expect(seed.addRole).toHaveBeenCalledWith('pulse', expect.objectContaining({ roleName: 'PulseAdmin' }));
      const created = seed.applications.get('pulse')?.roles.find(role => role.roleName === 'PulseAdmin');
      expect(seed.assignRole).toHaveBeenCalledWith({ type: 'USER', id: '1' }, created?.id, '1');
    });
  });
});
