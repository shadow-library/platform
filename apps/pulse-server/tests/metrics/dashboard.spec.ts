import { beforeEach, describe, expect, it } from 'bun:test';

import { type Notification, schema } from '@server/database';
import { TestEnvironment } from '@tests/test-environment';

const testEnv = new TestEnvironment('dashboard_test');

const DAY_MS = 86_400_000;

const startOfUtcDay = (date: Date): Date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

interface SeedJob {
  channel: Notification.Channel;
  status: Notification.Status;
  daysAgo: number;
}

/** Midday keeps every row inside its intended UTC day whatever the runner's local offset is. */
const at = (daysAgo: number): Date => new Date(startOfUtcDay(new Date()).getTime() - daysAgo * DAY_MS + DAY_MS / 2);

const SEED: SeedJob[] = [
  { channel: 'EMAIL', status: 'SENT', daysAgo: 0 },
  { channel: 'EMAIL', status: 'SENT', daysAgo: 0 },
  { channel: 'EMAIL', status: 'PERMANENTLY_FAILED', daysAgo: 0 },
  { channel: 'EMAIL', status: 'FAILED', daysAgo: 0 },
  { channel: 'SMS', status: 'PENDING', daysAgo: 0 },
  { channel: 'SMS', status: 'PROCESSING', daysAgo: 0 },
  { channel: 'EMAIL', status: 'SENT', daysAgo: 3 },
  { channel: 'PUSH', status: 'PERMANENTLY_FAILED', daysAgo: 3 },
  { channel: 'EMAIL', status: 'SENT', daysAgo: 30 },
];

describe('DashboardController', () => {
  testEnv.init();

  /** `TestEnvironment.init` clones a fresh database before every test, so the seed is re-applied each time. */
  beforeEach(async () => {
    const db = testEnv.getPostgresClient();
    const version = await db.query.templateVersions.findFirst();
    if (!version) throw new Error('the baseline seed produced no template version');

    /** The template seed ships its own jobs; these specs assert absolute counts, so they own the table outright. */
    await db.delete(schema.notificationJobs);
    await db.insert(schema.notificationJobs).values(
      SEED.map(job => ({
        templateId: version.templateId,
        templateVersionId: version.id,
        channel: job.channel,
        locale: 'en-ZZ',
        recipient: 'seed@example.com',
        status: job.status,
        createdAt: at(job.daysAgo),
      })),
    );
  });

  describe('GET /api/v1/dashboard/stats', () => {
    it('should bucket today by status, counting a retryable failure as pending', async () => {
      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).get('/api/v1/dashboard/stats');

      expect(response.statusCode).toBe(200);
      const { today } = response.json();
      expect(today.date).toBe(isoDay(new Date()));
      expect(today.overall).toStrictEqual({ total: 6, succeeded: 2, failed: 1, pending: 3 });
    });

    it('should return all three channels for today, zero-filling the ones with no traffic', async () => {
      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).get('/api/v1/dashboard/stats');

      const { channels } = response.json().today;
      expect(channels.email).toStrictEqual({ total: 4, succeeded: 2, failed: 1, pending: 1 });
      expect(channels.sms).toStrictEqual({ total: 2, succeeded: 0, failed: 0, pending: 2 });
      expect(channels.push).toStrictEqual({ total: 0, succeeded: 0, failed: 0, pending: 0 });
    });

    it('should return a contiguous zero-filled trend window ending today', async () => {
      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).get('/api/v1/dashboard/stats');

      const { trend } = response.json();
      expect(trend.stats).toHaveLength(7);
      expect(trend.fromDate).toBe(isoDay(at(6)));
      expect(trend.toDate).toBe(isoDay(new Date()));
      expect(trend.stats.map((entry: { date: string }) => entry.date)).toStrictEqual(Array.from({ length: 7 }, (_, index) => isoDay(at(6 - index))));

      const threeDaysAgo = trend.stats.find((entry: { date: string }) => entry.date === isoDay(at(3)));
      expect(threeDaysAgo).toStrictEqual({ date: isoDay(at(3)), total: 2, succeeded: 1, failed: 1, pending: 0 });
      expect(trend.stats.at(-2)).toStrictEqual({ date: isoDay(at(1)), total: 0, succeeded: 0, failed: 0, pending: 0 });
    });

    it('should exclude traffic older than the trend window', async () => {
      const response = await testEnv.getRouter().mockRequest().headers(testEnv.authHeaders()).get('/api/v1/dashboard/stats');

      const { trend } = response.json();
      const windowTotal = trend.stats.reduce((sum: number, entry: { total: number }) => sum + entry.total, 0);
      expect(windowTotal).toBe(8);
    });

    it('should refuse a caller without the metrics permission', async () => {
      const headers = await testEnv.userHeaders({ sub: 'usr_no_metrics', permissions: [] });

      const response = await testEnv.getRouter().mockRequest().headers(headers).get('/api/v1/dashboard/stats');

      expect(response.statusCode).toBe(403);
    });
  });
});
