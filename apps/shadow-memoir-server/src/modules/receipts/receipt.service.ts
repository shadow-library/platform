/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';
import { StorageService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AccountContext } from '@modules/auth';
import { AppErrorCode } from '@server/classes';
import { type DatabaseTransaction, type Receipt } from '@server/database';
import { APP_NAME } from '@server/constants';
import { logMetric } from '@server/telemetry';

import { type ReceiptCreateDto } from './receipt.dto';
import { ReceiptRepository } from './receipt.repository';

/**
 * Defining types
 */

interface UploadIssued {
  ref: string;
  uploadUrl: string;
  expiresAt: string;
}

interface DownloadIssued {
  url: string;
  expiresAt: string;
}

/**
 * Declaring the constants
 */

const PRESIGN_EXPIRES_SECONDS = 900;

/** ARCHITECTURE §19.2: content-type allowlist and its ref extension, independent of `packages/modules`' content-addressed extension map. */
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/**
 * The presign upload/confirm/download flow (ARCHITECTURE §19.2, ADR-0008). Every read/write is owner-
 * scoped through `ReceiptRepository`, so a foreign ref reads exactly like a nonexistent one — the
 * cross-user 404 the accept criteria call for falls out of that scoping rather than a bespoke check here.
 */
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
   * Idempotent: a re-confirm of an already-`stored` receipt just returns it. `stat` is the HEAD verify
   * (§19.2) — an oversize or wrong-type upload is deleted here rather than left `pending_upload` forever.
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

    const updated = await this.receiptRepository.markStored(ref, head.size, head.contentType);
    if (!updated) throw AppErrorCode.RCP_001.create();
    return updated;
  }

  async createDownload(ref: string): Promise<DownloadIssued> {
    const receipt = await this.receiptRepository.findByRef(ref);
    if (!receipt || receipt.status !== 'stored') throw AppErrorCode.RCP_001.create();

    const url = this.storageService.getPresignedDownloadUrl(ref, { expiresSeconds: PRESIGN_EXPIRES_SECONDS });
    return { url, expiresAt: this.expiresAt() };
  }

  /**
   * The expense-deletion cascade (ARCHITECTURE §19.2 Lifecycle): the receipt row is removed in the same
   * transaction as the expense row, but the object delete is best-effort — a storage fault here must
   * never fail the expense-deletion command, since the object-orphan sweep is the backstop.
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

  private expiresAt(): string {
    return new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000).toISOString();
  }

  private requireAccountId(): bigint {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('ReceiptService used without a resolved account context');
    return accountId;
  }
}
