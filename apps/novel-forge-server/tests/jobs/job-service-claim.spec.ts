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

describe('JobService — recovering authoring jobs', () => {
  function recoveryOver() {
    const wheres: SQL[] = [];
    const db = {
      update: () => ({ set: () => ({ where: (where: SQL) => ({ returning: async () => (wheres.push(where), []) }) }) }),
      select: () => ({ from: () => ({ where: async (where: SQL) => (wheres.push(where), [{ id: 'job-9' }]) }) }),
    };
    const service = new JobService({ getPostgresClient: () => db } as never, { publish: () => undefined } as never, new FakeAuthoringClaims().asService());
    const rendered = (): string[] => wheres.map(where => dialect.sqlToQuery(where).sql);
    return { service, rendered };
  }

  it('should reset on boot every running job except one a live, started claim still names', async () => {
    const { service, rendered } = recoveryOver();

    await service.recoverStuck();

    const [where] = rendered();
    expect(where).toStartWith(
      '("jobs"."status" = $1 and not exists (select 1 from "authoring_claims" where "authoring_claims"."job_id" = "jobs"."id" and "authoring_claims"."claimed_by" is not null',
    );
    expect(where).not.toContain('"jobs"."kind"');
  });

  it('should reset only authoring jobs on the periodic sweep, so a running publish is never pulled back', async () => {
    const { service, rendered } = recoveryOver();

    await service.resetOrphanedAuthoring();

    expect(rendered()[0]).toContain('"jobs"."kind" in ($2, $3, $4, $5, $6)');
  });

  it('should find pending authoring jobs that no live claim or reservation names', async () => {
    const { service, rendered } = recoveryOver();

    expect(await service.findUnclaimedPendingAuthoring()).toEqual(['job-9']);
    expect(rendered()[0]).toContain('not exists (select 1 from "authoring_claims" where "authoring_claims"."job_id" = "jobs"."id" and not (');
  });
});
