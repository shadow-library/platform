import { describe, expect, it, mock } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { NOTIFICATION_JOB_LEASE_MS, type NotificationJobExecutor } from '@modules/notification/notification-job.executor';
import { NotificationJobRunner } from '@modules/notification/notification-job.runner';
import { type Notification, schema } from '@server/database';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>(done => (resolve = done));
  return { promise, resolve };
}

/** What a zone-less timestamp decodes to under a non-UTC process time zone: the stored instant shifted by the offset. */
const shiftedLease = new Date(Date.now() + NOTIFICATION_JOB_LEASE_MS - 5.5 * 60 * 60 * 1000);

function job(id: string, status: Notification.Status = 'PROCESSING'): Notification.Job {
  return { id, status, nextAttemptAt: shiftedLease } as Notification.Job;
}

function createRunner(options: { claimed?: Notification.Job[]; execute?: (job: Notification.Job, lease: Date) => Promise<void> } = {}) {
  const claims: Record<string, unknown>[] = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['select', 'from', 'where', 'orderBy', 'limit', 'for']) chain[method] = () => chain;
  const postgres = {
    select: () => chain,
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            claims.push(values);
            return options.claimed ?? [];
          },
        }),
      }),
    }),
  };
  const execute = mock(options.execute ?? (async () => undefined));
  const runner = new NotificationJobRunner(new FakeDatabaseService({ postgres }), { execute } as unknown as NotificationJobExecutor);
  return { runner, execute, claims };
}

describe('NotificationJobRunner', () => {
  it('should admit a new job under a lease and execute it under the lease it wrote', () => {
    const { runner, execute } = createRunner();

    const admission = runner.admit();
    runner.start(job('a'), admission);

    expect(admission.status).toBe('PROCESSING');
    expect(admission.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + NOTIFICATION_JOB_LEASE_MS - 1000);
    expect(execute.mock.calls[0]?.[1]).toBe(admission.nextAttemptAt);
  });

  it('should leave a job admitted while draining due for another replica instead of executing it', async () => {
    const { runner, execute } = createRunner();
    await runner.onApplicationStop();

    const admission = runner.admit();
    runner.start(job('a', admission.status), admission);

    expect(admission.status).toBe('PENDING');
    expect(admission.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(execute).not.toHaveBeenCalled();
  });

  it('should not execute a job admitted before shutdown but started after it', async () => {
    const { runner, execute } = createRunner();
    const admission = runner.admit();
    await runner.onApplicationStop();

    runner.start(job('a'), admission);

    expect(execute).not.toHaveBeenCalled();
  });

  it('should wait for in-flight executions before stopping', async () => {
    const running = deferred();
    let finished = false;
    const { runner } = createRunner({ execute: () => running.promise.then(() => void (finished = true)) });
    runner.start(job('a'), runner.admit());

    const stopping = runner.onApplicationStop();
    running.resolve();
    await stopping;

    expect(finished).toBe(true);
  });

  it('should stop waiting at the drain deadline', async () => {
    const { runner } = createRunner({ execute: () => new Promise<void>(() => undefined) });
    Object.assign(runner, { drainTimeoutMs: 1 });
    runner.start(job('a'), runner.admit());

    await runner.onApplicationStop();

    expect(runner['inflight'].size).toBe(1);
  });

  it('should keep an execution that failed outside its own handling from rejecting', async () => {
    const { runner } = createRunner({ execute: async () => Promise.reject(new Error('pool closed')) });
    runner.start(job('a'), runner.admit());

    await runner.onApplicationStop();

    expect(runner['inflight'].size).toBe(0);
  });

  it('should execute every claimed job under the lease it wrote, not the one read back', async () => {
    const { runner, execute, claims } = createRunner({ claimed: [job('a'), job('b')] });

    await runner.recover();

    const written = claims[0]?.['nextAttemptAt'] as Date;
    expect(claims).toHaveLength(1);
    expect(claims[0]?.['status']).toBe('PROCESSING');
    expect(written.getTime()).toBeGreaterThan(Date.now() + NOTIFICATION_JOB_LEASE_MS - 1000);
    expect(execute.mock.calls.map(([claimed, lease]) => [claimed.id, lease])).toEqual([
      ['a', written],
      ['b', written],
    ]);
  });

  it('should not start a second recovery while one is still executing', async () => {
    const running = deferred();
    const { runner, claims } = createRunner({ claimed: [job('a')], execute: () => running.promise });

    const first = runner.recover();
    await runner.recover();
    running.resolve();
    await first;

    expect(claims).toHaveLength(1);
  });

  it('should not claim anything once draining', async () => {
    const { runner, claims } = createRunner({ claimed: [job('a')] });
    await runner.onApplicationStop();

    await runner.recover();

    expect(claims).toHaveLength(0);
  });
});

describe('NotificationJobRunner claim statement', () => {
  const now = Date.parse('2026-10-23T10:00:00.000Z');
  const lease = new Date(now + NOTIFICATION_JOB_LEASE_MS);
  const runner = new NotificationJobRunner(new FakeDatabaseService({ postgres: drizzle.mock({ schema }) }), {} as NotificationJobExecutor);
  const query = runner['claimStatement'](now, lease).toSQL();

  it('should lease a locked batch of due rows in one statement, skipping rows another replica holds', () => {
    expect(query.sql).toStartWith('update "notification_jobs" set "status" = $1, "next_attempt_at" = $2 where "notification_jobs"."id" in (select "id" from "notification_jobs"');
    expect(query.sql).toContain('order by "notification_jobs"."priority" desc, "notification_jobs"."next_attempt_at" asc limit $9 for update skip locked) returning');
    expect(query.params.slice(0, 2)).toEqual(['PROCESSING', lease.toISOString()]);
    expect(query.params[8]).toBe(10);
  });

  it('should claim expired leases, due retries and due pending jobs against the app-encoded clock', () => {
    expect(query.sql).toContain('("notification_jobs"."status" in ($3, $4, $5) and "notification_jobs"."next_attempt_at" <= $6)');
    expect(query.params.slice(2, 6)).toEqual(['PENDING', 'PROCESSING', 'FAILED', new Date(now).toISOString()]);
  });

  it('should only claim a lease-less pending row once the database clock says an old replica would have finished it', () => {
    expect(query.sql).toContain(
      '("notification_jobs"."status" = $7 and "notification_jobs"."next_attempt_at" is null and "notification_jobs"."created_at" <= now() - make_interval(secs => $8))',
    );
    expect(query.params.slice(6, 8)).toEqual(['PENDING', NOTIFICATION_JOB_LEASE_MS / 1000]);
  });
});
