import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { columnLabel, type FailedRow, type SealedSecretStore } from './sealed-secret.repository';
import { BACKFILL_BATCH_SIZE, SEALED_COLUMN_LIST } from './sealed-secret.constants';
import { type SecretSealer } from './secret-sealer.service';

export interface BackfillResult {
  sealed: number;
  skipped: number;
  failed: FailedRow[];
}

/**
 * Seals every row that still holds only a legacy secret, one transaction per batch. Idempotent: a sealed row is never read again, so a rerun after a
 * crash resumes where the last committed batch ended. A row it cannot read is reported and passed over, so one run names every broken row.
 */
export async function backfillSealedSecrets(store: SealedSecretStore, sealer: Pick<SecretSealer, 'sealLegacy'>, batchSize = BACKFILL_BATCH_SIZE): Promise<BackfillResult> {
  const logger = Logger.getLogger(APP_NAME, 'secret-backfill');
  const result: BackfillResult = { sealed: 0, skipped: 0, failed: [] };
  for (const column of SEALED_COLUMN_LIST) {
    let cursor: string | null = null;
    do {
      const batch = await store.backfillBatch(column, cursor, batchSize, async row => {
        try {
          return await sealer.sealLegacy(row.legacy, column, row.id);
        } catch (error) {
          logger.error('Could not seal a legacy secret', { column: columnLabel(column), id: row.id, code: AppError.is(error) ? error.code : 'unknown' });
          throw error;
        }
      });
      result.sealed += batch.sealed;
      result.skipped += batch.skipped;
      result.failed.push(...batch.failed.map(id => ({ column: columnLabel(column), id })));
      cursor = batch.cursor;
    } while (cursor !== null);
  }
  return result;
}
