import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { type Envelope } from '@shadow-library/common/crypto';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { applySeedCatalog, buildSeedCatalog, type CredentialImportDeps, importEnvCredential } from '@server/database/seed';

import { type CatalogDocument, type CredentialState } from '@modules/catalog/catalog.types';
import { credentialContext } from '@modules/credentials/credential.utils';

import { FakeCatalogVersionRepository } from '../catalog/fake-catalog-version.repository';
import { box, credentialId, FakeCredentialRepository, OPENROUTER_SECRET } from '../credentials/credential.fixtures';
import { SEED_URLS } from './seed.fixtures';

const ID = credentialId(7);

let restoreLogger: RestoreLogger;
let catalog: FakeCatalogVersionRepository;
let credentials: FakeCredentialRepository;
let deps: CredentialImportDeps;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

beforeEach(async () => {
  catalog = new FakeCatalogVersionRepository();
  credentials = new FakeCredentialRepository();
  Object.defineProperty(catalog, 'credentials', {
    get: (): CredentialState[] => credentials.rows.map(row => ({ id: row.id, allowedOrigin: row.allowedOrigin, revoked: row.revokedAt !== null })),
  });
  deps = { catalog, credentials: credentials.asRepository(), box: box(), newId: () => ID };
  await applySeedCatalog(catalog, buildSeedCatalog('standard', { ...SEED_URLS, openrouter: 'https://openrouter.ai/api/v1' }));
});

function activeDocument(): CatalogDocument {
  return catalog.published()[0]!.document as CatalogDocument;
}

describe('importEnvCredential', () => {
  it('should import the env key bound to OpenRouter and repoint the seeded provider in a new version', async () => {
    expect(await importEnvCredential(deps, OPENROUTER_SECRET)).toEqual({ imported: true, repointed: ['openrouter'] });

    const row = credentials.rows[0]!;
    expect({ id: row.id, name: row.name, allowedOrigin: row.allowedOrigin, createdBy: row.createdBy }).toEqual({
      id: ID,
      name: 'openrouter',
      allowedOrigin: 'https://openrouter.ai',
      createdBy: 'import',
    });
    expect((await box().open(row.secret as Envelope, credentialContext(ID))).toString()).toBe(OPENROUTER_SECRET);
    expect(catalog.published()[0]!.version).toBe(2);
    expect(activeDocument().providers.openrouter).toMatchObject({ credential: ID });
    expect(activeDocument().providers.openrouter).not.toHaveProperty('apiKeyConfig');
  });

  it('should change nothing on every later boot', async () => {
    await importEnvCredential(deps, OPENROUTER_SECRET);
    expect(await importEnvCredential(deps, OPENROUTER_SECRET)).toEqual({ imported: false, repointed: [] });
    expect(catalog.rows.map(row => row.version)).toEqual([1, 2]);
    expect(credentials.rows).toHaveLength(1);
  });

  it('should not repoint again after an admin moved the provider back to the env key', async () => {
    await importEnvCredential(deps, OPENROUTER_SECRET);
    const reverted = structuredClone(activeDocument());
    delete reverted.providers.openrouter!.credential;
    reverted.providers.openrouter!.apiKeyConfig = 'synapse.provider.openrouter.api-key';
    catalog.published()[0]!.state = 'ARCHIVED';
    catalog.seed(reverted, 3);
    expect(await importEnvCredential(deps, OPENROUTER_SECRET)).toEqual({ imported: false, repointed: [] });
  });

  it('should finish a repoint a crashed earlier run left undone', async () => {
    await credentials.createIfNameFree(
      { id: ID, name: 'openrouter', secret: await box().seal(OPENROUTER_SECRET, credentialContext(ID)), allowedOrigin: 'https://openrouter.ai', hint: 'h' },
      'import',
    );
    expect(await importEnvCredential(deps, OPENROUTER_SECRET)).toEqual({ imported: false, repointed: ['openrouter'] });
  });

  it('should neither import nor repoint without an env key, or onto a credential an admin created or revoked', async () => {
    expect(await importEnvCredential(deps, undefined)).toEqual({ imported: false, repointed: [] });
    await credentials.seed(credentialId(1), OPENROUTER_SECRET, { name: 'openrouter' });
    expect(await importEnvCredential(deps, OPENROUTER_SECRET)).toEqual({ imported: false, repointed: [] });
    credentials.rows[0]!.createdBy = 'import';
    credentials.rows[0]!.revokedAt = new Date();
    expect(await importEnvCredential(deps, OPENROUTER_SECRET)).toEqual({ imported: false, repointed: [] });
    expect(catalog.rows).toHaveLength(1);
  });

  it('should leave a provider on the env key when its URL is not at the OpenRouter origin', async () => {
    catalog = new FakeCatalogVersionRepository();
    deps = { ...deps, catalog };
    await applySeedCatalog(catalog, buildSeedCatalog('standard', { ...SEED_URLS, openrouter: 'https://proxy.internal/openrouter/v1' }));
    expect(await importEnvCredential(deps, OPENROUTER_SECRET)).toEqual({ imported: true, repointed: [] });
    expect(catalog.rows).toHaveLength(1);
  });

  it('should refuse to import a key no header can carry', async () => {
    expect(await importEnvCredential(deps, 'sk-or with spaces')).toEqual({ imported: false, repointed: [] });
    expect(credentials.rows).toEqual([]);
  });
});
