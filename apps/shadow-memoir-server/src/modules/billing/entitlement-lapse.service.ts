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
import { logMetric } from '@server/telemetry';

import { BillingRepository } from './billing.repository';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const SWEEP_NAME = 'entitlement-lapse';

/**
 * Writes down the lapse the read path already reports (ARCHITECTURE §16.2), so the client sees the tier
 * change in its next delta instead of only when the next webhook happens to arrive. Correctness never
 * depends on this sweep having run: `EntitlementService.get` derives the same state from server time on
 * every call, which is what makes a missed tick harmless and re-running one a no-op. Nothing is deleted
 * on lapse — only the tier moves.
 */
@Injectable()
export class EntitlementLapseService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, EntitlementLapseService.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly repository: BillingRepository,
  ) {}

  /** No billing pool configured means no credential to run as; the sweep stays unregistered rather than failing a tick every cadence on a replica that was never meant to write entitlements. */
  onModuleInit(): void {
    if (!Config.get('database.postgres.billing-url')) return;
    this.scheduler.registerSweep(SWEEP_NAME, Config.get('billing.lapse-sweep-interval-minutes') * 60_000, () => this.run());
  }

  async run(): Promise<void> {
    const lapsed = await this.repository.lapseExpired(new Date());
    if (lapsed > 0) logMetric(this.logger, 'Entitlements lapsed on server time', 'billing.lapsed', lapsed);
  }
}
