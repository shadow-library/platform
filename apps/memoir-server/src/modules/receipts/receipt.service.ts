import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';
import { StorageService } from '@shadow-library/modules';

import { AccountContext } from '@modules/auth';
import { AppErrorCode } from '@server/classes';
import { type DatabaseTransaction, type Receipt } from '@server/database';
import { APP_NAME } from '@server/constants';
import { logMetric } from '@server/telemetry';

import { type ReceiptCreateDto } from './receipt.dto';
import { ReceiptRepository } from './receipt.repository';

interface UploadIssued {
  ref: string;
  uploadUrl: string;
  expiresAt: string;
}

interface DownloadIssued {
  url: string;
  expiresAt: string;
}

const PRESIGN_EXPIRES_SECONDS = 900;

/** Content-type allowlist and its ref extension, independent of `packages/modules`' content-addressed extension map. */
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** Presign upload/confirm/download flow. Every read/write is owner-scoped through `ReceiptRepository`, so a foreign ref reads exactly like a nonexistent one. */
@Injectable()
export class ReceiptService {
  private readonly logger = Logger.getLogger(APP_NAME, ReceiptService.name);

  constructor(
    private readonly accountContext: AccountContext,
    private readonly receiptRepository: ReceiptRepository,
    private readonly storageService: StorageService,
  ) {}

  async createUpload(body: ReceiptCreateDto): Promise<UploadIssued> {
    const accountId = this.requireAccountId();
    const contentType = body.contentType.toLowerCase();
    const ext = ALLOWED_CONTENT_TYPES[contentType];
    if (!ext) throw AppErrorCode.RCP_002.create({ contentType: body.contentType });

    const maxBytes = Config.get('storage.max-receipt-bytes');
    if (!Number.isInteger(body.sizeBytes) || body.sizeBytes <= 0 || body.sizeBytes > maxBytes) throw AppErrorCode.RCP_003.create({ maxBytes });

    const ref = `r/${accountId}/${Bun.randomUUIDv7()}.${ext}`;
    await this.receiptRepository.create({ ref, accountId, contentType, sizeBytes: body.sizeBytes });

    const uploadUrl = this.storageService.getPresignedUploadUrl(ref, { contentType, expiresSeconds: PRESIGN_EXPIRES_SECONDS });
    return { ref, uploadUrl, expiresAt: this.expiresAt() };
  }

  /**
   * Idempotent: re-confirming a `stored` receipt returns it. `stat` is the HEAD verify; an oversize or wrong-type upload is deleted here rather
   * than left `pending_upload` forever.
   */
  async confirm(ref: string): Promise<Receipt.Row> {
    const receipt = await this.receiptRepository.findByRef(ref);
    if (!receipt || receipt.status === 'deleted') throw AppErrorCode.RCP_001.create();
    if (receipt.status === 'stored') return receipt;

    const head = await this.storageService.stat(ref).catch(() => null);
    if (!head) throw AppErrorCode.RCP_004.create();

    const maxBytes = Config.get('storage.max-receipt-bytes');
    const contentTypeAllowed = Boolean(ALLOWED_CONTENT_TYPES[head.contentType.toLowerCase()]);
    if (head.size > maxBytes || !contentTypeAllowed) {
      await this.storageService.delete(ref).catch(() => undefined);
      await this.receiptRepository.remove(ref);
      throw AppErrorCode.RCP_003.create({ maxBytes });
    }

    const updated = (await this.receiptRepository.markStored(ref, head.size, head.contentType)) ?? (await this.receiptRepository.findByRef(ref));
    if (updated?.status !== 'stored') throw AppErrorCode.RCP_001.create();
    return updated;
  }

  async createDownload(ref: string): Promise<DownloadIssued> {
    const receipt = await this.receiptRepository.findByRef(ref);
    if (!receipt || receipt.status !== 'stored') throw AppErrorCode.RCP_001.create();

    const url = this.storageService.getPresignedDownloadUrl(ref, { expiresSeconds: PRESIGN_EXPIRES_SECONDS });
    return { url, expiresAt: this.expiresAt() };
  }

  /**
   * Expense-deletion cascade: the receipt row goes in the expense's transaction, but the object delete is best-effort, since the object-orphan
   * sweep is the backstop for a storage fault.
   */
  async deleteForExpense(tx: DatabaseTransaction, ref: string): Promise<void> {
    const removed = await this.receiptRepository.removeInTx(tx, ref);
    if (!removed) return;

    try {
      await this.storageService.delete(ref);
    } catch (error) {
      logMetric(this.logger, 'Receipt object delete failed during expense-deletion cascade', 'receipts.cascade_object_delete_failed', 1, { ref }, 'warn');
      this.logger.warn('Receipt object delete failed during expense-deletion cascade', { ref, error });
    }
  }

  async isStoredInTx(tx: DatabaseTransaction, ref: string): Promise<boolean> {
    const receipt = await this.receiptRepository.findByRefForUpdateInTx(tx, ref);
    return receipt?.status === 'stored';
  }

  private expiresAt(): string {
    return new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000).toISOString();
  }

  private requireAccountId(): bigint {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('ReceiptService used without a resolved account context');
    return accountId;
  }
}
