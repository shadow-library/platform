import { describe, expect, it, spyOn } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect, QueryBuilder } from 'drizzle-orm/pg-core';

import { schema } from '@server/database';

import { CheckpointJanitor } from '@modules/jobs/checkpoint.janitor';

const dialect = new PgDialect();

describe('CheckpointJanitor.purgeJobEvents', () => {
  it('should delete only the events of jobs that settled before the retention window', async () => {
    const deletes: { table: unknown; where: SQL }[] = [];
    const db = {
      select: (fields: Parameters<QueryBuilder['select']>[0]) => new QueryBuilder().select(fields),
      delete: (table: unknown) => ({ where: async (where: SQL) => void deletes.push({ table, where }) }),
    };
    const janitor = new CheckpointJanitor({ getPostgresClient: () => db } as never);
    const before = Date.now();

    await janitor.purgeJobEvents(db as never, 7);
    const after = Date.now();

    expect(deletes.map(entry => entry.table)).toEqual([schema.jobEvents]);
    const query = dialect.sqlToQuery(deletes[0]?.where as SQL);
    expect(query.sql).toBe('"job_events"."job_id" in (select "id" from "jobs" where ("jobs"."status" in ($1, $2, $3) and "jobs"."updated_at" < $4))');
    expect(query.params.slice(0, 3)).toEqual(['done', 'failed', 'cancelled']);
    const cutoff = new Date(String(query.params[3]).replace(' ', 'T').replace(/Z?$/, 'Z'));
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 7 * 86_400_000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - 7 * 86_400_000);
  });
});

describe('CheckpointJanitor.purge', () => {
  const settledThreads = '(select "id"::text from "workflow_runs" where ("workflow_runs"."status" in ($1, $2, $3) and "workflow_runs"."ended_at" < $4))';

  const fakeDb = (settledRuns: number) => {
    const executed: SQL[] = [];
    const db = {
      $count: async () => settledRuns,
      select: (fields: Parameters<QueryBuilder['select']>[0]) => new QueryBuilder().select(fields),
      execute: async (query: SQL) => void executed.push(query),
    };
    return { db, executed };
  };

  it('should delete the checkpoints of settled runs through a subquery rather than a list of ids', async () => {
    const { db, executed } = fakeDb(2);
    const janitor = new CheckpointJanitor({ getPostgresClient: () => db } as never);

    const purged = await janitor.purge(db as never, 7);

    expect(purged).toBe(2);
    const queries = executed.map(query => dialect.sqlToQuery(query));
    expect(queries.map(query => query.sql)).toEqual([
      `DELETE FROM checkpoints WHERE thread_id IN ${settledThreads}`,
      `DELETE FROM checkpoint_writes WHERE thread_id IN ${settledThreads}`,
      `DELETE FROM checkpoint_blobs WHERE thread_id IN ${settledThreads}`,
    ]);
    expect(queries[0]?.params.slice(0, 3)).toEqual(['completed', 'failed', 'cancelled']);
  });

  it('should delete nothing when no run has settled', async () => {
    const { db, executed } = fakeDb(0);
    const janitor = new CheckpointJanitor({ getPostgresClient: () => db } as never);

    expect(await janitor.purge(db as never, 7)).toBe(0);
    expect(executed).toHaveLength(0);
  });
});

describe('CheckpointJanitor.purgeOrphans', () => {
  it('should delete the checkpoints of threads whose workflow run no longer exists', async () => {
    const executed: SQL[] = [];
    const db = { execute: async (query: SQL) => void executed.push(query) };
    const janitor = new CheckpointJanitor({ getPostgresClient: () => db } as never);

    await janitor.purgeOrphans(db as never);

    const orphaned = (table: string) => `DELETE FROM ${table} WHERE NOT EXISTS (select 1 from "workflow_runs" where "workflow_runs"."id"::text = ${table}.thread_id)`;
    expect(executed.map(query => dialect.sqlToQuery(query).sql)).toEqual([orphaned('checkpoints'), orphaned('checkpoint_writes'), orphaned('checkpoint_blobs')]);
  });
});

describe('CheckpointJanitor.onModuleInit', () => {
  it('should purge checkpoints on every sweep, not only at boot', async () => {
    const executed: SQL[] = [];
    const db = {
      $count: async () => 1,
      select: (fields: Parameters<QueryBuilder['select']>[0]) => new QueryBuilder().select(fields),
      execute: async (query: SQL) => void executed.push(query),
      delete: () => ({ where: async () => undefined }),
    };
    const janitor = new CheckpointJanitor({ getPostgresClient: () => db } as never);
    const scheduled: (() => Promise<void>)[] = [];
    const setIntervalSpy = spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => Promise<void>) => {
      scheduled.push(callback);
      return { unref: () => undefined } as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);

    try {
      await janitor.onModuleInit();
      const atBoot = executed.length;
      expect(atBoot).toBeGreaterThan(0);
      expect(scheduled).toHaveLength(1);

      await scheduled[0]?.();

      expect(executed.length).toBe(2 * atBoot);
    } finally {
      setIntervalSpy.mockRestore();
      janitor.onModuleDestroy();
    }
  });
});
