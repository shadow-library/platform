import { gte, inArray, SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { Notification, PrimaryDatabase, schema } from '@server/database';

import { DashboardStats, NotificationChannelStats, NotificationDeliveryStats } from './dashboard-stats.dto';

interface AggregateRow {
  day: string;
  channel: Notification.Channel;
  succeeded: string | number;
  failed: string | number;
  pending: string | number;
}

type DeliveryCounts = Omit<NotificationDeliveryStats, 'total'>;

const TREND_DAYS = 7;
const DAY_MS = 86_400_000;

/** `FAILED` is retryable, so it counts as pending; every status maps to exactly one bucket, which keeps `total` equal to `count(*)`. */
const SUCCEEDED_STATUSES = ['SENT'] satisfies Notification.Status[];
const FAILED_STATUSES = ['PERMANENTLY_FAILED'] satisfies Notification.Status[];
const PENDING_STATUSES = ['PENDING', 'PROCESSING', 'FAILED'] satisfies Notification.Status[];

const CHANNEL_KEYS: Record<Notification.Channel, keyof NotificationChannelStats> = { EMAIL: 'email', SMS: 'sms', PUSH: 'push' };

const emptyStats = (): NotificationDeliveryStats => ({ total: 0, succeeded: 0, failed: 0, pending: 0 });

const accumulate = (target: NotificationDeliveryStats, counts: DeliveryCounts): void => {
  target.succeeded += counts.succeeded;
  target.failed += counts.failed;
  target.pending += counts.pending;
  target.total = target.succeeded + target.failed + target.pending;
};

const toDayNumber = (date: Date): number => date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

const startOfUtcDay = (date: Date): Date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

@Injectable()
export class DashboardService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /** `created_at` is a naive `timestamp` in the database's clock while the buckets are UTC; they agree only because every deployment runs the database in UTC. */
  async getStats(): Promise<DashboardStats> {
    const todayStart = startOfUtcDay(new Date());
    const windowStart = new Date(todayStart.getTime() - (TREND_DAYS - 1) * DAY_MS);
    const rows = await this.aggregate(windowStart);

    const today = toDayNumber(todayStart);
    const days = Array.from({ length: TREND_DAYS }, (_, index) => toDayNumber(new Date(windowStart.getTime() + index * DAY_MS)));
    const perDay = new Map(days.map(day => [day, emptyStats()]));
    const overall = emptyStats();
    const channels: NotificationChannelStats = { email: emptyStats(), sms: emptyStats(), push: emptyStats() };

    for (const row of rows) {
      const counts: DeliveryCounts = { succeeded: Number(row.succeeded), failed: Number(row.failed), pending: Number(row.pending) };
      const day = Number(row.day);
      const dayStats = perDay.get(day);
      if (dayStats) accumulate(dayStats, counts);
      if (day !== today) continue;
      accumulate(overall, counts);
      accumulate(channels[CHANNEL_KEYS[row.channel]], counts);
    }

    const stats = days.map(day => ({ date: day, ...(perDay.get(day) ?? emptyStats()) }));
    return { today: { date: today, overall, channels }, trend: { fromDate: days[0] ?? today, toDate: today, stats } };
  }

  /** The caller zero-fills every day and channel: the DTO requires all three channels and the trend chart lays bars out by index. */
  private aggregate(windowStart: Date): Promise<AggregateRow[]> {
    const day = sql<string>`to_char(${schema.notificationJobs.createdAt}, 'YYYYMMDD')`;
    const countWhere = (statuses: Notification.Status[]): SQL<string> => sql<string>`count(*) filter (where ${inArray(schema.notificationJobs.status, statuses)})`;

    return this.db
      .select({
        day,
        channel: schema.notificationJobs.channel,
        succeeded: countWhere(SUCCEEDED_STATUSES),
        failed: countWhere(FAILED_STATUSES),
        pending: countWhere(PENDING_STATUSES),
      })
      .from(schema.notificationJobs)
      .where(gte(schema.notificationJobs.createdAt, windowStart))
      .groupBy(day, schema.notificationJobs.channel);
  }
}
