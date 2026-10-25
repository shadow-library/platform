import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { AppErrorCode } from '@server/classes';
import { applySeedCatalog, buildSeedCatalog } from '@server/database/seed';

import { NO_VERSION } from '@modules/catalog/catalog-version.repository';

import { catalogDocument } from '../catalog/catalog.fixtures';
import { FakeCatalogVersionRepository } from '../catalog/fake-catalog-version.repository';
import { SEED_URLS } from './seed.fixtures';

const DOCUMENT = buildSeedCatalog('standard', SEED_URLS);
const EXISTING_DOCUMENT = catalogDocument();
const INVALID_DOCUMENT = catalogDocument(document => (document.models['llama3.1']!.deployments = []));

let repository: FakeCatalogVersionRepository;
let restoreLogger: RestoreLogger;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());
beforeEach(() => (repository = new FakeCatalogVersionRepository()));

describe('applySeedCatalog', () => {
  it('should publish version 1 with the seed document and skip a second application', async () => {
    expect(await applySeedCatalog(repository, DOCUMENT)).toEqual({ seeded: true, version: 1 });
    expect(repository.rows).toHaveLength(1);
    expect(repository.rows[0]).toMatchObject({ version: 1, state: 'PUBLISHED', document: DOCUMENT, note: 'Seed catalog v1', createdBy: 'seed' });
    expect(repository.rows[0]!.publishedAt).toBeInstanceOf(Date);
    expect(await applySeedCatalog(repository, DOCUMENT)).toEqual({ seeded: false, version: 1 });
    expect(repository.rows).toHaveLength(1);
  });

  it('should preserve a pre-existing published version and skip validation of unused seed data', async () => {
    const existing = repository.seed(EXISTING_DOCUMENT, 4);
    expect(await applySeedCatalog(repository, INVALID_DOCUMENT)).toEqual({ seeded: false, version: 4 });
    expect(repository.rows).toEqual([existing]);
  });

  it('should preserve archived history even when there is no active version', async () => {
    const existing = repository.seed(EXISTING_DOCUMENT, 3, 'ARCHIVED');
    expect(await applySeedCatalog(repository, DOCUMENT)).toEqual({ seeded: false, version: 3 });
    expect(repository.rows).toEqual([existing]);
  });

  it('should seed when only a draft row the removed draft workflow left exists, and leave that row alone', async () => {
    const leftover = repository.seed(EXISTING_DOCUMENT, NO_VERSION, 'DRAFT');
    expect(await applySeedCatalog(repository, DOCUMENT, 'migration')).toEqual({ seeded: true, version: 1 });
    expect(repository.rows).toHaveLength(2);
    expect(repository.rows[0]).toEqual(leftover);
    expect(repository.published()[0]).toMatchObject({ version: 1, document: DOCUMENT, createdBy: 'migration' });
  });

  it('should refuse invalid seed data with catalog issues and insert nothing', async () => {
    await expect(applySeedCatalog(repository, INVALID_DOCUMENT)).rejects.toMatchObject({
      code: AppErrorCode.SYN_CATALOG_INVALID.code,
      data: { issues: [{ path: 'models.llama3.1.deployments', code: 'no_deployments' }] },
    });
    expect(repository.rows).toHaveLength(0);
  });

  it('should re-read history inside the exclusive lock', async () => {
    repository.beforeExclusive = () => void repository.seed(EXISTING_DOCUMENT, 2);
    expect(await applySeedCatalog(repository, DOCUMENT)).toEqual({ seeded: false, version: 2 });
    expect(repository.rows).toHaveLength(1);
    expect(repository.rows[0]!.document).toEqual(EXISTING_DOCUMENT);
  });

  it('should serialize concurrent applications and publish exactly once', async () => {
    const results = await Promise.all([applySeedCatalog(repository, DOCUMENT), applySeedCatalog(repository, DOCUMENT)]);
    expect(results).toEqual([
      { seeded: true, version: 1 },
      { seeded: false, version: 1 },
    ]);
    expect(repository.rows).toHaveLength(1);
  });
});
