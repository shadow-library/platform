/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { SchedulerService } from '@modules/scheduler';
import { APP_NAME } from '@server/constants';
import { logMetric, pseudoAccountId } from '@server/telemetry';

import { DeletionRepository } from './deletion.repository';
import { DeletionService } from './deletion.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const SWEEP_NAME = 'account-deletion-resume';
const SWEEP_PAGE_SIZE = 50;
const MS_PER_MINUTE = 60_000;

/**
 * Crash resumability (ARCHITECTURE §21): an account parked in a non-terminal deletion state since
 * before the resume threshold has lost its driver — the process that started it died mid-step, or a
 * purge pass returned short on its batch budget — so the sweep re-enters the machine at whatever state
 * the row records. Every step is idempotent, so re-driving a step that already ran costs nothing.
 */
@Injectable()
export class DeletionSweepService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, DeletionSweepService.name);

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
    const stalled = await this.deletionRepository.findStalled(staleBefore, SWEEP_PAGE_SIZE);

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
