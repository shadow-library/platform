import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { StorageService } from '@shadow-library/modules';

import { AccountRepository } from '@modules/auth';
import { SchedulerService } from '@modules/scheduler';
import { APP_NAME } from '@server/constants';
import { logMetric } from '@server/telemetry';

import { ReceiptRepository } from './receipt.repository';

const PENDING_UPLOAD_SWEEP_NAME = 'receipts-pending-upload-orphans';
const OBJECT_SWEEP_NAME = 'receipts-object-orphans';
const STALE_PAGE_SIZE = 200;
const ACCOUNT_PAGE_SIZE = 500;
const MS_PER_MINUTE = 60_000;

/**
 * Two orphan sweeps: (a) a `pending_upload` row older than `storage.orphan-sweep.pending-upload-max-age-minutes` never got confirmed, so its object (if any) and row are deleted;
 * (b) weekly, delete objects under each account's `r/{account_id}/` prefix with no `receipts` row (backstop for a failed cascade delete).
 */
@Injectable()
export class ReceiptSweepService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, ReceiptSweepService.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly receiptRepository: ReceiptRepository,
    private readonly accountRepository: AccountRepository,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit(): void {
    const pendingCadenceMs = Config.get('storage.orphan-sweep.pending-upload-interval-minutes') * MS_PER_MINUTE;
    this.scheduler.registerSweep(PENDING_UPLOAD_SWEEP_NAME, pendingCadenceMs, () => this.sweepPendingUploads());

    const objectCadenceMs = Config.get('storage.orphan-sweep.object-interval-minutes') * MS_PER_MINUTE;
    this.scheduler.registerSweep(OBJECT_SWEEP_NAME, objectCadenceMs, () => this.sweepOrphanObjects());
  }

  async sweepPendingUploads(): Promise<void> {
    const maxAgeMinutes = Config.get('storage.orphan-sweep.pending-upload-max-age-minutes');
    const cutoff = new Date(Date.now() - maxAgeMinutes * MS_PER_MINUTE);
    const stale = await this.receiptRepository.findStalePendingUploads(cutoff, STALE_PAGE_SIZE);

    let deleted = 0;
    for (const receipt of stale) {
      await this.storageService.delete(receipt.ref).catch(error => this.logger.warn('Failed to delete stale pending-upload object', { ref: receipt.ref, error }));
      await this.receiptRepository.removeByRefUnscoped(receipt.ref);
      deleted++;
    }

    logMetric(this.logger, 'Receipt pending-upload orphan sweep complete', 'receipts.pending_upload_orphans_deleted', deleted, { candidates: stale.length });
  }

  async sweepOrphanObjects(): Promise<void> {
    let deleted = 0;
    let scannedAccounts = 0;
    let afterId = 0n;

    for (;;) {
      const accountIds = await this.accountRepository.findAllIds(afterId, ACCOUNT_PAGE_SIZE);
      if (accountIds.length === 0) break;
      afterId = accountIds[accountIds.length - 1] as bigint;

      for (const accountId of accountIds) {
        scannedAccounts++;
        await this.sweepAccountPrefix(accountId).then(count => (deleted += count));
      }

      if (accountIds.length < ACCOUNT_PAGE_SIZE) break;
    }

    logMetric(this.logger, 'Receipt object-orphan sweep complete', 'receipts.object_orphans_deleted', deleted, { scannedAccounts });
  }

  private async sweepAccountPrefix(accountId: bigint): Promise<number> {
    const prefix = `r/${accountId}/`;
    const keys = await this.storageService.list(prefix).catch(error => {
      this.logger.error('Failed to list receipt prefix during object-orphan sweep', { accountId: String(accountId), error });
      return null;
    });
    if (!keys || keys.length === 0) return 0;

    const known = await this.receiptRepository.refsForAccount(accountId);
    let deleted = 0;
    for (const key of keys) {
      if (known.has(key)) continue;
      await this.storageService.delete(key).catch(error => this.logger.warn('Failed to delete orphan receipt object', { ref: key, error }));
      deleted++;
    }
    return deleted;
  }
}
