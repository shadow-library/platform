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
import { type NotificationOutbox } from '@server/database';
import { logMetric } from '@server/telemetry';

import { NotificationOutboxRepository } from './notification-outbox.repository';
import { PulseTransport } from './pulse-transport';

/**
 * Declaring the constants
 */

const SWEEP_NAME = 'notification-outbox-drain';
const MS_PER_MINUTE = 60_000;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_CAP_MS = 60 * MS_PER_MINUTE;

/** Exponential backoff (1m, 2m, 4m, 8m, ... capped at 1h) keyed off the attempt just spent, matching the AI executor's own retry shape. */
function backoffFor(attempts: number): Date {
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_CAP_MS);
  return new Date(Date.now() + delay);
}

/**
 * ARCHITECTURE §17/§4.5's outbox-style retry: pulse is called from here alone, decoupled from whatever
 * enqueued the row, so a pulse outage never fails the AI completion or a sweep — it only slows this
 * drain down. Runs on T-22's in-process scheduler; the claim (`FOR UPDATE SKIP LOCKED`) is already
 * multi-replica-safe for when the worker split (ADR-0002) activates.
 */
@Injectable()
export class NotificationSenderService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, NotificationSenderService.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly outbox: NotificationOutboxRepository,
    private readonly transport: PulseTransport,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerSweep(SWEEP_NAME, Config.get('notifications.sender-poll-interval-minutes') * MS_PER_MINUTE, async () => void (await this.drain()));
  }

  async drain(): Promise<number> {
    const limit = Config.get('notifications.sender-batch-size');
    let sent = 0;

    for (let i = 0; i < limit; i++) {
      const row = await this.outbox.claimNext();
      if (!row) break;
      if (await this.deliver(row)) sent++;
    }

    if (sent > 0) logMetric(this.logger, 'Notification outbox drained', 'notifications.sent', sent);
    return sent;
  }

  private async deliver(row: NotificationOutbox.Row): Promise<boolean> {
    const recipient = await this.outbox.accountRecipient(row.accountId);
    if (!recipient || recipient.deletionState !== 'none' || !recipient.email) {
      await this.outbox.markFailed(row.id, 'no eligible recipient (account deleted or has no email)');
      return false;
    }

    const outcome = await this.transport.send({ templateKey: row.templateKey, email: recipient.email, variables: row.variables as Record<string, unknown> });
    if (outcome === 'sent') {
      await this.outbox.markSent(row.id);
      return true;
    }

    if (row.attempts >= Config.get('notifications.sender-max-attempts')) {
      await this.outbox.markFailed(row.id, `${outcome} after ${row.attempts} attempts`);
      logMetric(this.logger, 'Notification outbox row exhausted its retry budget', 'notifications.exhausted', 1, { templateKey: row.templateKey, outcome }, 'warn');
      return false;
    }

    await this.outbox.markRetry(row.id, backoffFor(row.attempts), outcome);
    return false;
  }
}
