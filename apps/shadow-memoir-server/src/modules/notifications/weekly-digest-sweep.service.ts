/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { addDays, formatLocalDate, localDateAt, startOfMondayWeek, weekdayOf } from '@modules/rules';
import { SchedulerService } from '@modules/scheduler';

import { NotificationClient } from './notification-client.service';
import { type WeeklyDigestVariables } from './notification.types';
import { WeeklyDigestRepository, type WeekQuestLog } from './weekly-digest.repository';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const SWEEP_NAME = 'weekly-digest-assembly';
const MS_PER_MINUTE = 60_000;
const HOLD_STATES = ['completed', 'partial', 'late', 'recovery'] as const;
const MISS_STATES = ['missed', 'skipped', 'postponed'] as const;
/** ISO weekday (Monday=1..Sunday=7, `@modules/rules`'s convention). The digest for the week that just ended goes out the following Monday, once per account per week. */
const DIGEST_WEEKDAY = 1;

/**
 * ARCHITECTURE §17's weekly review email: aggregates only, assembled fresh from `quest_logs` and
 * `expenses` every run — adherence counts and a money total, never free text, never a health-flagged
 * table (§18's `is_health` set is structurally unreachable: `WeeklyDigestRepository` never selects it).
 */
@Injectable()
export class WeeklyDigestSweepService implements OnModuleInit {
  constructor(
    private readonly repository: WeeklyDigestRepository,
    private readonly scheduler: SchedulerService,
    private readonly notifications: NotificationClient,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerSweep(SWEEP_NAME, Config.get('notifications.digest-sweep-interval-minutes') * MS_PER_MINUTE, async () => void (await this.run()));
  }

  async run(now = new Date()): Promise<number> {
    const accounts = await this.repository.eligibleAccounts();
    let sent = 0;
    for (const account of accounts) {
      const today = localDateAt(now.getTime(), account.timezone);
      if (weekdayOf(today) !== DIGEST_WEEKDAY) continue;
      const result = await this.assemble(account.id, account.timezone, account.defaultCurrency, now);
      await this.notifications.enqueue(account.id, 'weeklyDigest', result.dedupeKey, result.variables);
      sent++;
    }
    return sent;
  }

  /** Splits out for the snapshot/canary test: pure assembly, no pref check, no enqueue — so the test can assert on the returned variables directly. */
  async assemble(accountId: bigint, timezone: string, defaultCurrency: string, now = new Date()): Promise<{ dedupeKey: string; variables: WeeklyDigestVariables }> {
    const today = localDateAt(now.getTime(), timezone);
    const mondayThisWeek = startOfMondayWeek(today);
    const weekStartDate = formatLocalDate(addDays(mondayThisWeek, -7));
    const weekEndDate = formatLocalDate(addDays(mondayThisWeek, -1));

    const logs = await this.repository.questLogsForWeek(accountId, weekStartDate, weekEndDate);
    const questsScheduledCount = logs.length;
    const questsCompletedCount = logs.filter(log => (HOLD_STATES as readonly string[]).includes(log.state)).length;
    const reasonTagCode = this.mostCommonReasonTag(logs);

    const netMinor = await this.repository.netExpenseMinorForWeek(accountId, weekStartDate, weekEndDate);
    const netAmount = Number(netMinor) / 100;

    return {
      dedupeKey: weekStartDate,
      variables: { weekStartDate, weekEndDate, questsCompletedCount, questsScheduledCount, netAmount, currencyCode: defaultCurrency, reasonTagCode },
    };
  }

  private mostCommonReasonTag(logs: WeekQuestLog[]): string | undefined {
    const tally = new Map<string, number>();
    for (const log of logs) {
      if (!(MISS_STATES as readonly string[]).includes(log.state) || !log.reasonTag) continue;
      tally.set(log.reasonTag, (tally.get(log.reasonTag) ?? 0) + 1);
    }
    let best: string | undefined;
    let bestCount = 0;
    for (const [tag, count] of tally) {
      if (count > bestCount) {
        best = tag;
        bestCount = count;
      }
    }
    return best;
  }
}
