/**
 * Importing npm packages
 */
import { Injectable, OnApplicationReady, OnApplicationStop } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { NotificationService } from '@server/modules/infrastructure/notification';

import { MaintenanceService } from './maintenance.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Maintenance runs on a coarser cadence than the notification loop: stale-claim purging is a
 * hygiene task, not a latency-sensitive one.
 */
const MAINTENANCE_EVERY_TICKS = 720;

/**
 * Drives periodic background jobs. It runs only in the worker process so the dispatch loop executes
 * exactly once regardless of how many API instances are scaled out.
 */
@Injectable()
export class WorkerService implements OnApplicationReady, OnApplicationStop {
  private readonly logger = Logger.getLogger(APP_NAME, WorkerService.name);
  private readonly intervalMs = Config.get('worker.poll-interval');
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private ticks = 0;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly maintenanceService: MaintenanceService,
  ) {}

  onApplicationReady(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.logger.info('Worker started', { intervalMs: this.intervalMs });
  }

  onApplicationStop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const sent = await this.notificationService.dispatchPending();
      if (sent > 0) this.logger.debug('Dispatched notifications', { sent });
      if (this.ticks++ % MAINTENANCE_EVERY_TICKS === 0) await this.maintenanceService.purgeStaleContactClaims();
    } catch (error) {
      this.logger.error('Worker tick failed', { error });
    } finally {
      this.running = false;
    }
  }
}
