/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { requireProductUrl } from '../../lib';
import { expect, test } from './fixtures';
import { createPublishedTemplate, insertNotificationJob, type NotificationChannel, type NotificationJobStatus } from './helpers';

/**
 * Defining types
 */

interface DeliveryStats {
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
}

interface DashboardStats {
  today: { date: string; overall: DeliveryStats; channels: Record<'email' | 'sms' | 'push', DeliveryStats> };
  trend: { fromDate: string; toDate: string; stats: (DeliveryStats & { date: string })[] };
}

/**
 * Declaring the constants
 *
 * `GET /api/v1/dashboard/stats` aggregates `notification_jobs` across the whole deployment — no organisation or
 * service scoping — so the bucketing is asserted as the *delta* between a read before and a read after this test's
 * own rows land, and this file runs in the single-worker `pulse-serial` project so no copy of it overlaps another.
 * The jobs are written straight to `notification_jobs` because every send route is gated on the service-only
 * `notifications:send` scope (see `security.spec.ts`).
 */
const TREND_DAYS = 7;

const DAY_MS = 86_400_000;

/** One job per bucket: `SENT` is succeeded, `FAILED` is the retryable state and counts as pending, `PERMANENTLY_FAILED` is failed. */
const ONE_PER_BUCKET: NotificationJobStatus[] = ['SENT', 'FAILED', 'PERMANENTLY_FAILED'];

const ONE_PER_BUCKET_DELTA: DeliveryStats = { total: 3, succeeded: 1, failed: 1, pending: 1 };

async function readStats(ctx: APIRequestContext): Promise<DashboardStats> {
  const response = await ctx.get('/api/v1/dashboard/stats');
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as DashboardStats;
}

function delta(before: DeliveryStats, after: DeliveryStats): DeliveryStats {
  return { total: after.total - before.total, succeeded: after.succeeded - before.succeeded, failed: after.failed - before.failed, pending: after.pending - before.pending };
}

function dayOf(stats: DashboardStats, date: string): DeliveryStats {
  const entry = stats.trend.stats.find(day => day.date === date);
  if (!entry) throw new Error(`the trend has no entry for ${date}: ${stats.trend.stats.map(day => day.date).join(', ')}`);
  return entry;
}

function trendTotal(stats: DashboardStats): number {
  return stats.trend.stats.reduce((sum, day) => sum + day.total, 0);
}

/** `YYYY-MM-DD` for `offset` days before `date`, in UTC — the calendar the service buckets in. */
function shiftDay(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
}

test.describe('dashboard stats', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  test('should require the metrics permission — a caller without it is refused 403 IAM_002', async ({ pulse }) => {
    const permissionless = await pulse.staff({ label: 'stats-none' });
    const viewer = await pulse.staff({ label: 'stats-viewer', permissions: ['pulse:metrics:read'] });

    const refused = await permissionless.ctx.get('/api/v1/dashboard/stats');
    expect(refused.status()).toBe(403);
    expect((await refused.json()) as { code?: string }).toMatchObject({ code: 'IAM_002' });

    const stats = await readStats(viewer.ctx);
    expect(stats.trend.stats).toHaveLength(TREND_DAYS);
    expect(stats.trend.fromDate).toBe(stats.trend.stats[0]?.date);
    expect(stats.trend.toDate).toBe(stats.today.date);
  });

  test('should bucket a retryable failure as pending and a terminal one as failed, zero-fill the trend and exclude older traffic', async ({ pulse }) => {
    const admin = await pulse.admin();
    const viewer = await pulse.staff({ label: 'stats-buckets', permissions: ['pulse:metrics:read'] });
    const template = await createPublishedTemplate(admin, 'stats');
    pulse.trackTemplate(template.id);

    const before = await readStats(viewer.ctx);
    const today = before.today.date;
    const inWindow = shiftDay(today, -(TREND_DAYS - 2));
    const outsideWindow = shiftDay(today, -(TREND_DAYS + 1));
    const queue = async (channel: NotificationChannel, status: NotificationJobStatus, createdAt: Date): Promise<void> => {
      const recipient = `e2e.stats.${randomBytes(6).toString('hex')}@shadow-apps.test`;
      pulse.trackJobs(await insertNotificationJob({ templateId: template.id, templateVersionId: template.versionId, channel, recipient, status, createdAt }));
    };

    // Today's rows go on PUSH: nothing in this deployment has ever queued a push job, so that bucket moves only by
    // what this test queued even if an unrelated email or SMS delivery lands between the two reads.
    for (const status of ONE_PER_BUCKET) await queue('PUSH', status, new Date());
    await queue('EMAIL', 'SENT', new Date(Date.parse(`${inWindow}T12:00:00Z`)));
    await queue('SMS', 'FAILED', new Date(Date.parse(`${inWindow}T12:00:00Z`)));
    await queue('PUSH', 'PERMANENTLY_FAILED', new Date(Date.parse(`${inWindow}T12:00:00Z`)));
    await queue('EMAIL', 'SENT', new Date(Date.parse(`${outsideWindow}T12:00:00Z`)));

    const after = await readStats(viewer.ctx);
    expect(after.today.date, 'the day rolled over mid-test; the deltas below would compare different windows').toBe(today);

    expect(delta(before.today.channels.push, after.today.channels.push)).toEqual(ONE_PER_BUCKET_DELTA);
    expect(delta(dayOf(before, inWindow), dayOf(after, inWindow))).toEqual(ONE_PER_BUCKET_DELTA);
    expect(trendTotal(after) - trendTotal(before), 'the job outside the window counts nowhere in the trend').toBe(ONE_PER_BUCKET_DELTA.total * 2);
    expect(
      after.trend.stats.map(day => day.date),
      'the window is contiguous and zero-filled, whatever each day carried',
    ).toEqual(Array.from({ length: TREND_DAYS }, (_, index) => shiftDay(today, index - (TREND_DAYS - 1))));

    const channels = after.today.channels;
    const summed = (key: keyof DeliveryStats): number => channels.email[key] + channels.sms[key] + channels.push[key];
    for (const key of ['total', 'succeeded', 'failed', 'pending'] as const) expect(after.today.overall[key], `today's overall ${key} is the sum of its channels`).toBe(summed(key));
    for (const stats of [after.today.overall, channels.email, channels.sms, channels.push, ...after.trend.stats]) {
      expect(stats.total, 'every status lands in exactly one bucket, so a total is the sum of the three').toBe(stats.succeeded + stats.failed + stats.pending);
    }
  });
});
