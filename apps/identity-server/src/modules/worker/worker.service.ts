/**
 * Importing npm packages
 */
import { Injectable, OnApplicationReady, OnApplicationStop } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { BackChannelLogoutService } from '@server/modules/auth/token';
import { NotificationService } from '@server/modules/infrastructure/notification';
import { WebhookDeliveryService } from '@server/modules/infrastructure/webhook';

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
  private current: Promise<void> | null = null;
  private running = false;
  private ticks = 0;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly backChannelLogoutService: BackChannelLogoutService,
    private readonly webhookDeliveryService: WebhookDeliveryService,
    private readonly maintenanceService: MaintenanceService,
  ) {}

  async onApplicationReady(): Promise<void> {
    /** Deliveries interrupted by the previous worker's crash re-enter the claimable pool first. */
    await this.notificationService.recoverStuckDeliveries();
    await this.backChannelLogoutService.recoverStuckDeliveries();
    await this.webhookDeliveryService.recoverStuckDeliveries();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.logger.info('Worker started', { intervalMs: this.intervalMs });
  }

  /** Graceful drain: stop scheduling new ticks, then wait for the in-flight one to finish. */
  async onApplicationStop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.current) await this.current;
    this.logger.info('Worker drained and stopped');
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.current = this.run();
    try {
      await this.current;
    } finally {
      this.running = false;
      this.current = null;
    }
  }

  private async run(): Promise<void> {
    try {
      const sent = await this.notificationService.dispatchPending();
      if (sent > 0) this.logger.debug('Dispatched notifications', { sent });
      const logouts = await this.backChannelLogoutService.dispatchPending();
      if (logouts > 0) this.logger.debug('Dispatched back-channel logouts', { logouts });
      const webhooks = await this.webhookDeliveryService.dispatchPending();
      if (webhooks > 0) this.logger.debug('Dispatched webhooks', { webhooks });
      if (this.ticks++ % MAINTENANCE_EVERY_TICKS === 0) await this.maintenanceService.purgeStaleContactClaims();
    } catch (error) {
      this.logger.error('Worker tick failed', { error });
    }
  }
}
