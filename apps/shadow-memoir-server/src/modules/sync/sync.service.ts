/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AccountContext } from '@modules/auth';
import { CommandBus, type CommandEnvelope } from '@modules/commands';
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { logMetric, pseudoAccountId, TelemetryService } from '@server/telemetry';

import { DeltaRepository } from './delta.repository';
import { DeltaSourceRegistry } from './delta-source.registry';
import { type DeltaPage, type DeltaRow } from './sync.types';

/**
 * Defining types
 */

export interface BatchOutcome {
  commandId: string;
  status: string;
  result: Record<string, unknown>;
  replayed: boolean;
  error?: { code: string; message: string };
}

export interface DeltaRequest {
  since: bigint;
  domains?: string[];
  limit?: number;
}

/**
 * Declaring the constants
 */

@Injectable()
export class SyncService {
  private readonly logger = Logger.getLogger(APP_NAME, SyncService.name);

  constructor(
    private readonly accountContext: AccountContext,
    private readonly commandBus: CommandBus,
    private readonly registry: DeltaSourceRegistry,
    private readonly deltaRepository: DeltaRepository,
    private readonly telemetry: TelemetryService,
  ) {}

  /**
   * Strict batch order, one transaction per command (§12.2), so a later command observes everything the
   * commands before it committed. Types are checked against the registry before the first command runs:
   * an outbox carrying a type this server has no handler for is a client-version problem, and failing
   * the whole batch up front is cleaner than half-applying it and leaving the client to reconcile.
   *
   * A command whose handler raises a domain error stops the batch instead of being skipped. Its
   * transaction — the `command_log` claim included — rolled back, so the client resends it under the
   * same id; letting the commands behind it proceed would apply them against a state their author never
   * intended. An internal error is not an outcome at all and propagates as a 500.
   */
  async submitBatch(commands: CommandEnvelope[]): Promise<BatchOutcome[]> {
    const accountId = this.requireAccountId();
    const known = new Set(this.commandBus.registeredTypes());
    for (const command of commands) if (!known.has(command.type)) throw AppErrorCode.CMD_001.create({ type: command.type });

    const outcomes: BatchOutcome[] = [];
    let failed = 0;
    try {
      for (const command of commands) {
        try {
          const outcome = await this.commandBus.execute(accountId, command);
          outcomes.push({ commandId: outcome.commandId, status: outcome.status, result: outcome.result, replayed: outcome.replayed });
        } catch (error) {
          if (!AppError.is(error) || error.isInternal) throw error;
          failed++;
          outcomes.push({ commandId: command.commandId, status: 'failed', result: {}, replayed: false, error: error.toResponse() });
          break;
        }
      }
      return outcomes;
    } finally {
      if (commands.length > 0) {
        const replayed = outcomes.filter(outcome => outcome.replayed).length;
        logMetric(this.logger, 'Sync command batch submitted', 'sync.command_error_rate', failed / commands.length, { commandCount: commands.length, failed });
        this.telemetry.emit({
          name: 'sync_batch_submitted',
          pseudoId: pseudoAccountId(accountId),
          occurredAtMs: Date.now(),
          commandCount: commands.length,
          appliedCount: outcomes.length - failed,
          failedCount: failed,
          replayedCount: replayed,
        });
      }
    }
  }

  /**
   * Every registered domain is read at `sync_seq > since`, and the cursor advances only as far as the
   * least-complete keyset domain, so a truncated page never strands rows behind an advanced cursor.
   * Once the pull has drained, the cursor is additionally held `sync.cursor-overlap` behind the highest
   * sequence observed (§12.2), which re-serves rows whose sequence value was drawn before a concurrent
   * transaction's but committed after it. The overlap is skipped while `hasMore` is set, because a page
   * spanning fewer sequence values than the overlap could otherwise never advance the cursor at all.
   */
  async pullDelta(request: DeltaRequest): Promise<DeltaPage> {
    const limit = request.limit ?? Config.get('sync.page-size');
    const sources = this.registry.resolve(request.domains);

    const domains: Record<string, DeltaRow[]> = {};
    const truncatedAt: bigint[] = [];
    let observedMax = request.since;

    for (const source of sources) {
      if (source.kind === 'snapshot') {
        domains[source.domain] = await source.fetch();
        continue;
      }

      const records = await source.fetch({ since: request.since, limit });
      domains[source.domain] = records.map(record => record.row);
      const last = records.at(-1);
      if (!last) continue;
      if (last.syncSeq > observedMax) observedMax = last.syncSeq;
      if (records.length >= limit) truncatedAt.push(last.syncSeq);
    }

    const tombstones = await this.deltaRepository.tombstonesSince(request.since, limit);
    const lastTombstone = tombstones.at(-1);
    if (lastTombstone) {
      if (lastTombstone.syncSeq > observedMax) observedMax = lastTombstone.syncSeq;
      if (tombstones.length >= limit) truncatedAt.push(lastTombstone.syncSeq);
    }

    const hasMore = truncatedAt.length > 0;
    if (hasMore) return { cursor: truncatedAt.reduce((min, seq) => (seq < min ? seq : min)), hasMore, domains, tombstones };

    const overlap = BigInt(Config.get('sync.cursor-overlap'));
    const lagged = observedMax > overlap ? observedMax - overlap : 0n;
    return { cursor: lagged > request.since ? lagged : request.since, hasMore, domains, tombstones };
  }

  private requireAccountId(): bigint {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('sync route reached without a resolved account context');
    return accountId;
  }
}
