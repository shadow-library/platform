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
import { type ExportJob } from '@server/database';
import { APP_NAME } from '@server/constants';

import { ExportJobRepository } from './export-job.repository';

/**
 * Defining types
 */

export interface ExportJobView {
  id: string;
  status: ExportJob.Status;
  requestedAt: string;
  completedAt: string | null;
  downloadUrl: string | null;
  expiresAt: string | null;
}

/**
 * Declaring the constants
 */

const MS_PER_DAY = 86_400_000;

/**
 * ARCHITECTURE §20: the request-path half of account export — `RequestExport` (enqueue, guarded 1/day)
 * and status polling. The assembly itself never runs here; `ExportAssemblerService`'s sweep claims and
 * streams the job. Export is not entitlement-gated (§20) — every account, free or paid, can request one.
 */
@Injectable()
export class ExportService {
  private readonly logger = Logger.getLogger(APP_NAME, ExportService.name);

  constructor(
    private readonly accountContext: AccountContext,
    private readonly exportJobRepository: ExportJobRepository,
    private readonly storageService: StorageService,
  ) {}

  async request(): Promise<ExportJobView> {
    const accountId = this.requireAccountId();
    const since = new Date(Date.now() - MS_PER_DAY);
    const recent = await this.exportJobRepository.countSince(accountId, since);
    const maxPerDay = Config.get('export.max-per-day');
    if (recent >= maxPerDay) throw AppErrorCode.EXP_002.create();

    const id = Bun.randomUUIDv7();
    const job = await this.exportJobRepository.create(id, accountId);
    this.logger.info('export_requested', { accountId: String(accountId), jobId: id });
    return this.toView(job);
  }

  async status(id: string): Promise<ExportJobView> {
    const job = await this.exportJobRepository.findByIdForAccount(id);
    if (!job) throw AppErrorCode.EXP_001.create();
    return this.toView(job);
  }

  private toView(job: ExportJob.Row): ExportJobView {
    const downloadUrl =
      job.status === 'done' && job.objectKey ? this.storageService.getPresignedDownloadUrl(job.objectKey, { expiresSeconds: Config.get('export.download-presign-seconds') }) : null;
    return {
      id: job.id,
      status: job.status,
      requestedAt: job.requestedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      downloadUrl,
      expiresAt: job.expiresAt?.toISOString() ?? null,
    };
  }

  private requireAccountId(): bigint {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('ExportService used without a resolved account context');
    return accountId;
  }
}
