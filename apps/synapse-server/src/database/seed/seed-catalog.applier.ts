import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { checkCatalogDocument } from '@modules/catalog/catalog-validator';
import { type CatalogVersionRepository, DRAFT_VERSION } from '@modules/catalog/catalog-version.repository';
import { type CatalogDocument } from '@modules/catalog/catalog.types';

export async function applySeedCatalog(
  repository: Pick<CatalogVersionRepository, 'exclusive'>,
  document: CatalogDocument,
  createdBy = 'seed',
): Promise<{ seeded: boolean; version?: number }> {
  const logger = Logger.getLogger(APP_NAME, 'seed-catalog');
  const result = await repository.exclusive(async store => {
    const version = await store.maxVersion();
    if (version !== DRAFT_VERSION) return { seeded: false, version };

    const check = checkCatalogDocument(document, null);
    if (!check.valid) throw AppErrorCode.SYN_CATALOG_INVALID.create({ issues: check.issues });
    await store.insertPublished({ version: 1, document, note: 'Seed catalog v1', createdBy });
    return { seeded: true, version: 1 };
  });
  logger.info(result.seeded ? 'Seeded the catalog' : 'Catalog already seeded; skipped', { version: result.version });
  return result;
}
