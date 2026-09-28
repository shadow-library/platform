import { afterEach, describe, expect, it, mock } from 'bun:test';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { OAuthClientService } from '@server/modules/auth/oauth';
import { type SeedApplication } from '@server/modules/bootstrap/ecosystem-seed.constants';
import { EcosystemSeedService } from '@server/modules/bootstrap/ecosystem-seed.service';
import { type OAuthClient } from '@server/modules/infrastructure/datastore';

const SEED: SeedApplication = { name: 'novel-forge', displayName: 'Novel Forge', description: 'Authoring', resourceName: 'Novel Forge API' };
const WORKLOAD_SUBJECT = 'system:serviceaccount:novel-forge:novel-forge-server';

function reconcilerFor(client: Partial<OAuthClient>) {
  const requireWorkloadIdentity = mock<OAuthClientService['requireWorkloadIdentity']>(() => Promise.resolve(client.tokenEndpointAuthMethod === 'client_secret_basic'));
  const updateClient = mock<OAuthClientService['updateClient']>(() => Promise.resolve());
  const oauthClientService = {
    getClient: () => Promise.resolve({ id: SEED.name, workloadSubjects: [WORKLOAD_SUBJECT], ...client }),
    ensureRedirectUris: () => Promise.resolve(),
    removeRedirectUri: () => Promise.resolve(),
    updateClient,
    requireWorkloadIdentity,
  } as unknown as OAuthClientService;
  const service = new EcosystemSeedService({} as never, {} as never, oauthClientService, {} as never, {} as never);
  const reconcile = (): Promise<void> => (service as unknown as { reconcileClient(seed: SeedApplication): Promise<void> }).reconcileClient(SEED);
  return { reconcile, requireWorkloadIdentity, updateClient };
}

describe('EcosystemSeedService client reconcile', () => {
  let restore: RestoreConfig = () => undefined;

  afterEach(() => restore());

  it('should move a client seeded with a fallback secret onto workload identity once the deployment is production-flagged', async () => {
    restore = setConfig({ 'app.stage': 'prod', 'oauth.issuer': 'https://identity.shadow-apps.com' });
    const { reconcile, requireWorkloadIdentity } = reconcilerFor({ tokenEndpointAuthMethod: 'client_secret_basic' });

    await reconcile();

    expect(requireWorkloadIdentity).toHaveBeenCalledWith(SEED.name);
  });

  it('should leave the fallback secret working outside a production deployment', async () => {
    restore = setConfig({ 'app.stage': 'dev', 'app.env': 'development', 'oauth.issuer': 'https://identity.shadow-apps.com' });
    const { reconcile, requireWorkloadIdentity, updateClient } = reconcilerFor({ tokenEndpointAuthMethod: 'client_secret_basic', workloadSubjects: [] });

    await reconcile();

    expect(requireWorkloadIdentity).not.toHaveBeenCalled();
    expect(updateClient).toHaveBeenCalledWith(SEED.name, { workloadSubjects: [WORKLOAD_SUBJECT] });
  });

  it('should only ever move a secret-authenticated client, never a public one', async () => {
    const updates: { values: Record<string, unknown>; params: unknown[] }[] = [];
    const postgres = {
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: (condition: SQL) => ({ returning: () => (updates.push({ values, params: new PgDialect().sqlToQuery(condition).params }), Promise.resolve([])) }),
        }),
      }),
    };
    const service = new OAuthClientService(new FakeDatabaseService({ postgres }), {} as never);

    expect(await service.requireWorkloadIdentity(SEED.name)).toBe(false);
    expect(updates[0]?.values).toMatchObject({ tokenEndpointAuthMethod: 'private_key_jwt' });
    expect(updates[0]?.params).toEqual([SEED.name, 'client_secret_basic']);
  });
});
