import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

import { SchedulerService } from '@modules/scheduler';
import { type Entitlement } from '@server/database';

import { BillingReminderRepository } from './billing-reminder.repository';
import { NotificationClient } from './notification-client.service';

interface ReminderCandidate {
  accountId: bigint;
  state: Entitlement.State;
  dueDate: Date;
}

const SWEEP_NAME = 'billing-reminder-due';
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The account's own Memoir billing state (`entitlements`): trial ending, grace, lapse, approaching renewal; never the personal `subscriptions` finance tracks.
 * The `memoir-billing-reminder` template carries one `state` variable shaped like `entitlement_state` and no subscription name/id, so it can only describe one thing per account.
 */
@Injectable()
export class BillingReminderSweepService implements OnModuleInit {
  constructor(
    private readonly repository: BillingReminderRepository,
    private readonly scheduler: SchedulerService,
    private readonly notifications: NotificationClient,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerSweep(SWEEP_NAME, Config.get('notifications.billing-sweep-interval-minutes') * MS_PER_MINUTE, async () => void (await this.run()));
  }

  async run(now = new Date()): Promise<number> {
    const candidates = await this.findCandidates(now);
    for (const candidate of candidates) await this.remind(candidate);
    return candidates.length;
  }

  private async findCandidates(now: Date): Promise<ReminderCandidate[]> {
    const horizon = new Date(now.getTime() + Config.get('notifications.billing-reminder-lead-days') * MS_PER_DAY);
    const rows = await this.repository.findDue(horizon);

    return rows.reduce<ReminderCandidate[]>((candidates, row) => {
      const dueDate = row.state === 'grace' ? row.graceEndsAt : row.expiresAt;
      if (dueDate) candidates.push({ accountId: row.accountId, state: row.state, dueDate });
      return candidates;
    }, []);
  }

  private async remind(candidate: ReminderCandidate): Promise<void> {
    const dedupeKey = `${candidate.state}:${toDateOnly(candidate.dueDate)}`;
    await this.notifications.enqueue(candidate.accountId, 'billingReminder', dedupeKey, {
      state: candidate.state,
      expiresAtDate: toDateOnly(candidate.dueDate),
      amount: Config.get('billing.price-monthly-minor') / 100,
      currencyCode: Config.get('billing.currency'),
    });
  }
}
