import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { SchedulerService } from '@modules/scheduler';
import { APP_NAME } from '@server/constants';
import { logMetric, pseudoAccountId } from '@server/telemetry';

import { DeletionRepository } from './deletion.repository';
import { DeletionService } from './deletion.service';

const SWEEP_NAME = 'account-deletion-resume';
const SWEEP_PAGE_SIZE = 50;
const MS_PER_MINUTE = 60_000;

/**
 * Crash resumability: an account parked in a non-terminal deletion state past the resume threshold has lost its driver (the process died mid-step, or a purge pass returned short),
 * so the sweep re-enters the machine at the recorded state. Every step is idempotent, so re-driving one that already ran costs nothing.
 */
@Injectable()
export class DeletionSweepService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, DeletionSweepService.name);
  /** Each pass resumes after the last account the previous one reached, so accounts that never advance cannot hold the page and starve the ones behind them. */
  private cursor = 0n;

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly deletionRepository: DeletionRepository,
    private readonly deletionService: DeletionService,
  ) {}

  onModuleInit(): void {
    const cadenceMs = Config.get('deletion.sweep-interval-minutes') * MS_PER_MINUTE;
    this.scheduler.registerSweep(SWEEP_NAME, cadenceMs, () => this.sweep());
  }

  async sweep(): Promise<void> {
    const staleBefore = new Date(Date.now() - Config.get('deletion.resume-after-minutes') * MS_PER_MINUTE);
    const stalled = await this.deletionRepository.findStalled(staleBefore, this.cursor, SWEEP_PAGE_SIZE, this.deletionService.parkedStates());
    const last = stalled.at(-1);
    this.cursor = stalled.length < SWEEP_PAGE_SIZE || !last ? 0n : last.accountId;

    let resumed = 0;
    for (const account of stalled) {
      await this.deletionService
        .drive(account.accountId)
        .then(() => resumed++)
        .catch((error: Error) =>
          this.logger.error('Stalled deletion failed to resume', { pseudoAccountId: pseudoAccountId(account.accountId), from: account.deletionState, error }),
        );
    }

    logMetric(this.logger, 'Account deletion resumption sweep complete', 'deletion.resumed', resumed, { candidates: stalled.length });
  }
}
