import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { schema } from '@server/database';

import { JobService } from '@modules/jobs/job.service';

import { FakeAuthoringClaims } from './authoring-claim-fixtures';

const dialect = new PgDialect();

function jobsOver(claims: FakeAuthoringClaims, newJobId = 'job-2') {
  const announced: unknown[] = [];
  const transactions: ('committed' | 'rolled back')[] = [];
  const db = {
    insert: (table: unknown) => ({
      values: () => ({ onConflictDoNothing: () => ({ returning: async () => (table === schema.jobs ? [{ id: newJobId }] : []) }) }),
    }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ projectId: 1n, kind: 'generate', status: 'cancelled' }] }) }) }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      try {
        const result = await run(db);
        transactions.push('committed');
        return result;
      } catch (error) {
        transactions.push('rolled back');
        throw error;
      }
    },
  };
  const events = { publish: (_: bigint, event: unknown) => void announced.push(event) };
  const service = new JobService({ getPostgresClient: () => db } as never, events as never, claims.asService());
  return { service, announced, transactions };
}

describe('JobService.enqueue — authoring claim', () => {
  it('should reserve the claim for a new authoring job in the transaction that creates it', async () => {
    const claims = new FakeAuthoringClaims();
    const { service, transactions } = jobsOver(claims);

    await service.enqueue(1n, 'generate', '3');

    expect(claims.rows.get(1n)).toMatchObject({ jobId: 'job-2', kind: 'generate', claimedBy: null });
    expect(transactions).toEqual(['committed']);
  });

  it('should refuse an authoring job while another job holds the project, rolling its row back and announcing nothing', async () => {
    const claims = new FakeAuthoringClaims();
    await claims.acquire(1n, 'job-1', 'import');
    const { service, announced, transactions } = jobsOver(claims);

    await expect(service.enqueue(1n, 'generate', '3')).rejects.toMatchObject({ code: 'JOB_002' });
    expect(transactions).toEqual(['rolled back']);
    expect(announced).toEqual([]);
    expect(claims.rows.get(1n)?.jobId).toBe('job-1');
  });

  it('should refuse while a synchronous finalize holds the project', async () => {
    const claims = new FakeAuthoringClaims();
    await claims.acquire(1n, null, 'finalize');
    const { service } = jobsOver(claims);

    await expect(service.enqueue(1n, 'generate', '3')).rejects.toMatchObject({ code: 'JOB_002' });
  });

  it('should take over a claim whose holder stopped heartbeating', async () => {
    const claims = new FakeAuthoringClaims();
    await claims.acquire(1n, 'job-1', 'generate');
    claims.expire(1n);
    const { service } = jobsOver(claims);

    await service.enqueue(1n, 'generate', '3');

    expect(claims.rows.get(1n)?.jobId).toBe('job-2');
  });

  it('should enqueue a job that writes no prose without consulting the claim', async () => {
    const claims = new FakeAuthoringClaims();
    await claims.acquire(1n, 'job-1', 'generate');
    const { service, transactions } = jobsOver(claims);

    await service.enqueue(1n, 'publish', 'publish-1');

    expect(transactions).toEqual(['committed']);
    expect(claims.rows.get(1n)?.jobId).toBe('job-1');
  });
});

describe('JobService.cancel — authoring claim', () => {
  it('should free the reservation of an authoring job cancelled before it started', async () => {
    const claims = new FakeAuthoringClaims();
    await claims.reserve(undefined, 1n, 'job-2', 'generate');
    const { service } = jobsOver(claims);

    await service.cancel('job-2', 1n);

    expect(claims.rows.size).toBe(0);
  });
});

describe('JobService — recovering abandoned jobs', () => {
  function recoveryOver(returned: unknown[] = [{ id: 'job-3', kind: 'review', target: 't' }]) {
    const wheres: SQL[] = [];
    const sets: Record<string, unknown>[] = [];
    const db = {
      update: () => ({
        set: (set: Record<string, unknown>) => (
          sets.push(set),
          { where: (where: SQL) => (wheres.push(where), Object.assign(Promise.resolve(), { returning: async () => returned })) }
        ),
      }),
      select: () => ({ from: () => ({ where: async (where: SQL) => (wheres.push(where), [{ id: 'job-9' }]) }) }),
      transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    };
    const service = new JobService({ getPostgresClient: () => db } as never, { publish: () => undefined } as never, new FakeAuthoringClaims().asService());
    const rendered = (): string[] => wheres.map(where => dialect.sqlToQuery(where).sql);
    const params = (): unknown[][] => wheres.map(where => dialect.sqlToQuery(where).params);
    return { service, rendered, params, sets };
  }

  it('should reset a running job of any kind only once it has been silent past the owner silence window and no live, started claim names it', async () => {
    const { service, rendered } = recoveryOver();

    expect(await service.resetAbandoned([])).toEqual(['job-3']);

    const [where] = rendered();
    expect(where).toStartWith(
      '("jobs"."status" = $1 and greatest("jobs"."heartbeat_at", "jobs"."updated_at" at time zone \'utc\') < now() - make_interval(secs => $2) and not exists (',
    );
    expect(where).toContain('"authoring_claims"."claimed_by" is not null');
    expect(where).not.toContain('"jobs"."kind"');
    expect(where).not.toContain('not in');
  });

  it('should never reset a job this replica is itself running, however long it stalled', async () => {
    const { service, rendered } = recoveryOver();

    await service.resetAbandoned(['job-1', 'job-2']);

    expect(rendered()[0]).toEndWith(' and "jobs"."id" not in ($4, $5))');
  });

  it('should count thirty seconds of silence as abandonment', async () => {
    const { service, params } = recoveryOver();

    await service.resetAbandoned([]);

    expect(params()[0]?.slice(0, 2)).toEqual(['in_progress', 30]);
  });

  it('should stamp the heartbeat by the database clock when a job starts, and answer the attempt it started', async () => {
    const { service, sets } = recoveryOver([{ projectId: 1n, kind: 'review', status: 'in_progress', sessionId: null, attempts: 2 }]);

    expect(await service.start('job-3')).toBe(2);
    expect(dialect.sqlToQuery(sets[0]?.['heartbeatAt'] as SQL).sql).toBe('now()');
  });

  it('should heartbeat only the attempt that still holds the running row', async () => {
    const { service, rendered, params, sets } = recoveryOver();

    expect(await service.heartbeat({ id: 'job-3', attempts: 2 })).toBe(true);

    expect(Object.keys(sets[0] ?? {})).toEqual(['heartbeatAt']);
    expect(rendered()[0]).toBe('("jobs"."id" = $1 and "jobs"."attempts" = $2 and "jobs"."status" = $3)');
    expect(params()[0]).toEqual(['job-3', 2, 'in_progress']);
  });

  it('should report a superseded attempt from its heartbeat', async () => {
    const { service } = recoveryOver([]);

    expect(await service.heartbeat({ id: 'job-3', attempts: 1 })).toBe(false);
  });

  it('should write nothing for a superseded attempt that settles, reports progress or retries', async () => {
    const { service, rendered } = recoveryOver([]);
    const superseded = { id: 'job-3', attempts: 1 };

    expect(await service.succeed(superseded)).toBeUndefined();
    expect(await service.fail(superseded, 'model down')).toBeUndefined();
    expect(await service.settleCancelled(superseded)).toBeUndefined();
    expect(await service.scheduleRetry(superseded, 'timed out', new Date())).toBeUndefined();
    await service.progress(superseded, { done: 0, total: 1, current: 'notes', phase: 'organising' });

    const fenced = '"jobs"."id" = $1 and "jobs"."attempts" = $2 and "jobs"."status" = $3';
    expect(rendered().every(where => where.includes(fenced))).toBe(true);
    expect(rendered()).toHaveLength(5);
  });

  it('should compact an import payload only for the attempt that still holds the running row', async () => {
    const { service, rendered, sets } = recoveryOver([]);

    await service.compactImportPayload({ id: 'job-3', attempts: 1 }, 12, true);

    expect(sets[0]?.['payload']).toEqual({ chapters: 12, hasCover: true });
    expect(rendered()[0]).toBe('("jobs"."id" = $1 and "jobs"."attempts" = $2 and "jobs"."status" = $3)');
  });

  it('should refuse only a job still pending', async () => {
    const { service, rendered } = recoveryOver([]);

    await service.refuse('job-3', 'another job holds the novel');

    expect(rendered()[0]).toBe('("jobs"."id" = $1 and "jobs"."status" = $2)');
  });

  it('should find pending authoring jobs that no live claim or reservation names', async () => {
    const { service, rendered } = recoveryOver();

    expect(await service.findUnclaimedPendingAuthoring()).toEqual(['job-9']);
    expect(rendered()[0]).toContain('not exists (select 1 from "authoring_claims" where "authoring_claims"."job_id" = "jobs"."id" and not (');
  });
});
