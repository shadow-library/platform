import { Inject, Injectable, InjectionToken, type OnApplicationReady, type OnApplicationStop } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { type CatalogTimers } from '@modules/catalog';
import { APP_NAME } from '@server/constants';

import { MeteringRepository } from './metering.repository';
import { type LedgerSweepCutoffs } from './metering.types';

export const METERING_TIMERS = new InjectionToken<CatalogTimers>('METERING_TIMERS');

const DAY_MS = 86_400_000;
const SWEEP_INTERVAL_MS = 10 * 60_000;
/** Beyond the request timeout and the shutdown grace, room for a settlement still writing when its call ended */
const UNSETTLED_MARGIN_MS = 5 * 60_000;

/**
 * Every replica sweeps every ten minutes, marking the rows of calls that died before settling, and prunes the ledger once a day. The advisory
 * lock lets one replica sweep at a time; a replica that finds it held tries again on its next tick.
 */
@Injectable()
export class LedgerRetentionService implements OnApplicationReady, OnApplicationStop {
  private readonly logger = Logger.getLogger(APP_NAME, LedgerRetentionService.name);
  private stopSweeping: (() => void) | null = null;
  private running: Promise<void> | null = null;
  private lastPrunedAt: number | null = null;

  constructor(
    private readonly repository: MeteringRepository,
    @Inject(METERING_TIMERS) private readonly timers: CatalogTimers,
  ) {}

  onApplicationReady(): void {
    void this.sweep();
    this.stopSweeping = this.timers.every(SWEEP_INTERVAL_MS, () => void this.sweep());
  }

  onApplicationStop(): void {
    this.stopSweeping?.();
    this.stopSweeping = null;
  }

  /** Never rejects, and a sweep still running is joined rather than started again */
  sweep(now: Date = new Date()): Promise<void> {
    this.running ??= this.run(now).finally(() => (this.running = null));
    return this.running;
  }

  private cutoffs(now: Date, prune: boolean): LedgerSweepCutoffs {
    const unsettledAfterMs = Config.get('synapse.request.timeout-ms') + Config.get('synapse.shutdown.grace-ms') + UNSETTLED_MARGIN_MS;
    const unsettledBefore = new Date(now.getTime() - unsettledAfterMs);
    if (!prune) return { unsettledBefore };
    return { unsettledBefore, pruneBefore: new Date(now.getTime() - Config.get('synapse.ledger.retention-days') * DAY_MS) };
  }

  private async run(now: Date): Promise<void> {
    const prune = this.lastPrunedAt === null || now.getTime() - this.lastPrunedAt >= DAY_MS;
    const cutoffs = this.cutoffs(now, prune);
    try {
      const result = await this.repository.sweepLedger(cutoffs);
      if (!result) return this.logger.debug('Skipped the ledger sweep; another replica holds the lock', { cutoffs });
      if (prune) this.lastPrunedAt = now.getTime();
      if (result.unsettled > 0) this.logger.warn('Marked calls that never settled', { unsettled: result.unsettled, before: cutoffs.unsettledBefore });
      if (result.pruned !== undefined) this.logger.info('Pruned the usage ledger', { deleted: result.pruned, before: cutoffs.pruneBefore });
    } catch (error) {
      this.logger.error('Failed to sweep the usage ledger', { cutoffs, error });
    }
  }
}
