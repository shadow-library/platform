/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';
import { StorageService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { SchedulerService } from '@modules/scheduler';
import { APP_NAME } from '@server/constants';
import { type Account, type ExportJob, getSensitivityManifest } from '@server/database';
import { logMetric } from '@server/telemetry';

import { ExportAssemblyRepository } from './export-assembly.repository';
import { ExportJobRepository } from './export-job.repository';
import { EXPORT_TABLE_REGISTRY, type ExportTableEntry } from './export-table-registry';

/**
 * Defining types
 */

interface AccountSnapshot {
  id: string;
  identitySub: string;
  email: string | null;
  displayName: string | null;
  authProvider: Account.AuthProvider;
  defaultCurrency: string;
  timezone: string;
  level: number;
  totalXp: string;
  coins: number;
  createdAt: string;
}

/**
 * Declaring the constants
 */

const EXPORT_SCHEMA_VERSION = 1;
const ASSEMBLE_SWEEP_NAME = 'export-assemble';
const CLEANUP_SWEEP_NAME = 'export-cleanup';
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * ARCHITECTURE §20: assembles the full-account export (every §10.3 table, incl. `hero_events`, sensitive
 * fields verbatim — export is the one path where the owner gets everything the platform holds) and the
 * 7-day cleanup that follows it. Both run as scheduler sweeps registered on `SchedulerService`, never
 * inline in a request — assembling a large `hero_events` history is unbounded work.
 */
@Injectable()
export class ExportAssemblerService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, ExportAssemblerService.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly exportJobRepository: ExportJobRepository,
    private readonly assemblyRepository: ExportAssemblyRepository,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerSweep(ASSEMBLE_SWEEP_NAME, Config.get('export.assembler-interval-minutes') * MS_PER_MINUTE, () => this.sweepAssemble());
    this.scheduler.registerSweep(CLEANUP_SWEEP_NAME, Config.get('export.cleanup-interval-minutes') * MS_PER_MINUTE, () => this.sweepCleanup());
  }

  async sweepAssemble(): Promise<void> {
    const jobs = await this.exportJobRepository.claimPending(Config.get('export.claim-batch-size'));
    let assembled = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        await this.assemble(job);
        assembled++;
      } catch (error) {
        failed++;
        const reason = error instanceof Error ? error.message : 'unknown export failure';
        await this.exportJobRepository.markFailed(job.id, reason);
        this.logger.error('export_assembly_failed', { jobId: job.id, accountId: String(job.accountId), error });
      }
    }

    logMetric(this.logger, 'Export assembler sweep complete', 'export.assembled', assembled, { claimed: jobs.length, failed });
  }

  async sweepCleanup(): Promise<void> {
    const batchSize = Config.get('export.claim-batch-size');
    const expired = await this.exportJobRepository.findExpired(new Date(), batchSize);

    let removed = 0;
    for (const job of expired) {
      if (job.objectKey) await this.storageService.delete(job.objectKey).catch(error => this.logger.warn('Failed to delete expired export object', { jobId: job.id, error }));
      await this.exportJobRepository.removeUnscoped(job.id);
      removed++;
    }

    logMetric(this.logger, 'Export cleanup sweep complete', 'export.cleaned_up', removed, { candidates: expired.length });
  }

  private async assemble(job: ExportJob.Row): Promise<void> {
    const account = await this.assemblyRepository.findAccountSnapshot(job.accountId);
    if (!account) throw AppError.internal(`export job '${job.id}' claimed for a nonexistent account '${job.accountId}'`);

    const pageSize = Config.get('export.page-size');
    const tables: Record<string, unknown[]> = {};
    for (const entry of EXPORT_TABLE_REGISTRY) tables[entry.key] = await this.paginateTable(job.accountId, entry, pageSize);
    await this.attachReceiptDownloadUrls(tables['receipts']);

    const manifest = {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      accountId: String(job.accountId),
      jobId: job.id,
      generatedAt: new Date().toISOString(),
      account: this.accountSnapshot(account),
      sensitiveFields: getSensitivityManifest(),
      tables,
    };

    const objectKey = `exports/${job.accountId}/${job.id}.json`;
    const bytes = new TextEncoder().encode(JSON.stringify(manifest, jsonReplacer));
    await this.storageService.putAt(objectKey, bytes, 'application/json');

    const expiresAt = new Date(Date.now() + Config.get('export.retention-days') * MS_PER_DAY);
    await this.exportJobRepository.markDone(job.id, objectKey, expiresAt);
  }

  private accountSnapshot(account: Account.Row): AccountSnapshot {
    return {
      id: String(account.id),
      identitySub: account.identitySub,
      email: account.email,
      displayName: account.displayName,
      authProvider: account.authProvider,
      defaultCurrency: account.defaultCurrency,
      timezone: account.timezone,
      level: account.level,
      totalXp: String(account.totalXp),
      coins: account.coins,
      createdAt: account.createdAt.toISOString(),
    };
  }

  /** Receipt bytes are never embedded (§20): a `stored` receipt gets a short-lived presigned `GET` in the manifest instead, minted at assembly time from the same driver the download endpoint uses. */
  private async attachReceiptDownloadUrls(rows: unknown[] | undefined): Promise<void> {
    if (!rows) return;
    const expiresSeconds = Config.get('export.download-presign-seconds');
    for (const row of rows as { ref: string; status: string; downloadUrl?: string }[]) {
      if (row.status === 'stored') row.downloadUrl = this.storageService.getPresignedDownloadUrl(row.ref, { expiresSeconds });
    }
  }

  /** Bounded per-query memory regardless of a table's history length (`hero_events` foremost) — the whole point of the §20 "keyset pagination per table" requirement. */
  private async paginateTable(accountId: bigint, entry: ExportTableEntry, pageSize: number): Promise<unknown[]> {
    const rows: unknown[] = [];
    let cursor: unknown = null;

    for (;;) {
      const page = await this.assemblyRepository.fetchPage(accountId, entry, cursor, pageSize);
      rows.push(...page);
      if (page.length < pageSize) break;
      cursor = (page[page.length - 1] as Record<string, unknown>)[entry.cursorKey];
    }

    return rows;
  }
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
