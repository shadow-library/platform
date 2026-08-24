import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';

import { MemoirAuthModule } from '@modules/auth';
import { FinanceModule } from '@modules/finance';
import { QuickLogsModule } from '@modules/quick-logs';
import { SyncModule } from '@modules/sync';
import { DatastoreModule } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

/**
 * T-35's load sanity check (ARCHITECTURE §26, §35): ~100 synthetic accounts, each through a
 * representative command+delta mix, asserting p95 latency stays under a sane bound with zero errors.
 * Gated behind `RUN_LOAD_TEST` — a full 100-account run against a template-cloned local Postgres is
 * heavier than the rest of the suite and adds nothing to ordinary CI runs; it still must be runnable
 * locally on demand: `RUN_LOAD_TEST=1 bun test tests/load/load-sanity.spec.ts`.
 */

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, FinanceModule, QuickLogsModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_load_sanity_spec`;

const SYNTHETIC_ACCOUNTS = 100;
const CONCURRENCY = 20;
const P95_BOUND_MS = 800;

interface Timing {
  op: string;
  ms: number;
  ok: boolean;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

async function chunked<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(worker));
  }
}

describe.skipIf(!process.env['RUN_LOAD_TEST'])('Load sanity: 100 synthetic accounts (T-35)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it(`should drive ${SYNTHETIC_ACCOUNTS} synthetic accounts through a command+delta mix with zero errors and a sane p95`, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const timings: Timing[] = [];

    async function timed(op: string, action: () => Promise<{ statusCode: number }>): Promise<void> {
      const start = performance.now();
      const response = await action();
      timings.push({ op, ms: performance.now() - start, ok: response.statusCode >= 200 && response.statusCode < 300 });
    }

    async function driveAccount(index: number): Promise<void> {
      const token = await userToken(`load-sanity-sub-${index}`);
      const headers = { authorization: `Bearer ${token}` };

      await timed('delta.initial', () => router.mockRequest().get('/api/v1/sync/delta').headers(headers).query({ since: '0' }));

      await timed('commands.journal', () =>
        router
          .mockRequest()
          .post('/api/v1/sync/commands')
          .headers(headers)
          .body({
            commands: [
              {
                commandId: Bun.randomUUIDv7(),
                type: 'journal.save',
                payload: { id: Bun.randomUUIDv7(), draft: { date: today, text: `load test entry ${index}` } },
                localDate: today,
              },
            ],
          }),
      );

      await timed('commands.expense', () =>
        router
          .mockRequest()
          .post('/api/v1/sync/commands')
          .headers(headers)
          .body({
            commands: [
              {
                commandId: Bun.randomUUIDv7(),
                type: 'expense.create',
                payload: { id: Bun.randomUUIDv7(), amountMinor: 500 + index, amountText: '5.00', currency: 'USD', categoryId: 'food', occurredOn: today },
                localDate: today,
              },
            ],
          }),
      );

      await timed('delta.followup', () => router.mockRequest().get('/api/v1/sync/delta').headers(headers).query({ since: '0' }));
    }

    await chunked(
      Array.from({ length: SYNTHETIC_ACCOUNTS }, (_unused, index) => index),
      CONCURRENCY,
      driveAccount,
    );

    const failures = timings.filter(timing => !timing.ok);
    const allMs = timings.map(timing => timing.ms);
    const p50 = percentile(allMs, 50);
    const p95 = percentile(allMs, 95);
    const max = Math.max(...allMs);

    console.log(
      `[load-sanity] requests=${timings.length} accounts=${SYNTHETIC_ACCOUNTS} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms failures=${failures.length}`,
    );

    expect(failures).toEqual([]);
    expect(p95).toBeLessThan(P95_BOUND_MS);
  }, 120_000);
});
