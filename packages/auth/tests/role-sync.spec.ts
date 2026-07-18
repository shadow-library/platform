/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AuthClient, RoleCatalogManifest } from '@shadow-library/auth';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const AUDIENCE = 'api://pulse';
const CLIENT = { id: 'svc-pulse', secret: 's3cr3t' };
const MANIFEST: RoleCatalogManifest = {
  permissions: [{ name: 'posts:write', description: 'Edit posts' }, { name: 'posts:delete' }],
  roles: [{ name: 'editor', description: 'Content editor', permissions: ['posts:write'] }],
};

describe('AuthClient.syncRoles', () => {
  let idp: TestIdP;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret });
  });
  afterAll(() => idp.stop());

  it('should push the catalog with a service bearer token and return the sync result', async () => {
    const auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT });
    const result = await auth.syncRoles(MANIFEST);

    expect(result).toMatchObject({ permissionsUpserted: 2, rolesUpserted: 1 });
    const received = idp.getLastCatalog();
    expect(received?.manifest.permissions).toHaveLength(2);
    expect(received?.manifest.roles).toHaveLength(1);
    expect(received?.authorization).toMatch(/^Bearer .+/);
  });

  it('should require service-account credentials', async () => {
    const auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE });
    await expect(auth.syncRoles(MANIFEST)).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });

  it('should surface a failing catalog endpoint as ROLE_SYNC_FAILED', async () => {
    const auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT });
    idp.setEndpointFailure('/api/v1/authz/catalog', true);
    await expect(auth.syncRoles(MANIFEST)).rejects.toMatchObject({ code: 'ROLE_SYNC_FAILED' });
    idp.setEndpointFailure('/api/v1/authz/catalog', false);
  });
});
