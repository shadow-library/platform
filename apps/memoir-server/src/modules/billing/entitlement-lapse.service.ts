import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { SchedulerService } from '@modules/scheduler';
import { APP_NAME } from '@server/constants';
import { logMetric } from '@server/telemetry';

import { BillingRepository } from './billing.repository';

const SWEEP_NAME = 'entitlement-lapse';

/**
 * Writes down the lapse the read path already reports, so the client sees the tier change in its next delta instead of only when the next webhook arrives.
 * Correctness never depends on this sweep: `EntitlementService.get` derives the same state from server time on every call, so a missed tick is
 * harmless and a re-run is a no-op. Nothing is deleted on lapse, only the tier moves.
 */
@Injectable()
export class EntitlementLapseService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, EntitlementLapseService.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly repository: BillingRepository,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerSweep(SWEEP_NAME, Config.get('billing.lapse-sweep-interval-minutes') * 60_000, () => this.run());
  }

  async run(): Promise<void> {
    const lapsed = await this.repository.lapseExpired(new Date());
    if (lapsed > 0) logMetric(this.logger, 'Entitlements lapsed on server time', 'billing.lapsed', lapsed);
  }
}
