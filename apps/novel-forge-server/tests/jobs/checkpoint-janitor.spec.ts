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
  const orphanedThreads = (table: string) =>
    `select distinct thread_id from ${table} where not exists (select 1 from "workflow_runs" where "workflow_runs"."id"::text = ${table}.thread_id) limit $1`;

  function orphanDb(orphans: Record<string, string[]>) {
    const executed: { sql: string; params: unknown[] }[] = [];
    const db = {
      execute: async (query: SQL) => {
        const rendered = dialect.sqlToQuery(query);
        executed.push(rendered);
        const table = /^select distinct thread_id from (\w+) /.exec(rendered.sql)?.[1];
        if (!table) return [];
        const batch = (orphans[table] ?? []).splice(0, Number(rendered.params[0]));
        return batch.map(thread_id => ({ thread_id }));
      },
    };
    return { db, executed };
  }

  it('should delete, across every checkpoint table, the threads whose workflow run no longer exists', async () => {
    const { db, executed } = orphanDb({ checkpoint_blobs: ['run-gone'] });
    const janitor = new CheckpointJanitor({ getPostgresClient: () => db } as never);

    expect(await janitor.purgeOrphans(db as never)).toBe(1);

    expect(executed.map(query => query.sql)).toEqual([
      orphanedThreads('checkpoints'),
      orphanedThreads('checkpoint_writes'),
      orphanedThreads('checkpoint_blobs'),
      'DELETE FROM checkpoints WHERE thread_id IN ($1)',
      'DELETE FROM checkpoint_writes WHERE thread_id IN ($1)',
      'DELETE FROM checkpoint_blobs WHERE thread_id IN ($1)',
    ]);
    expect(executed[3]?.params).toEqual(['run-gone']);
  });

  it('should purge orphans a bounded batch at a time until a table has none left', async () => {
    const threads = Array.from({ length: 250 }, (_, index) => `run-${index}`);
    const { db, executed } = orphanDb({ checkpoints: threads });
    const janitor = new CheckpointJanitor({ getPostgresClient: () => db } as never);

    expect(await janitor.purgeOrphans(db as never)).toBe(250);

    const deletes = executed.filter(query => query.sql.startsWith('DELETE FROM checkpoints '));
    expect(deletes.map(query => query.params.length)).toEqual([200, 50]);
  });
});

describe('CheckpointJanitor.onModuleInit', () => {
  const flush = () => new Promise(resolve => setImmediate(resolve));

  function scheduling() {
    const scheduled: (() => Promise<void>)[] = [];
    const spy = spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => Promise<void>) => {
      scheduled.push(callback);
      return { unref: () => undefined } as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);
    return { scheduled, restore: () => spy.mockRestore() };
  }

  it('should not hold boot on its first sweep', async () => {
    const db = { $count: () => new Promise<number>(() => undefined) };
    const janitor = new CheckpointJanitor({ getPostgresClient: () => db } as never);
    const { scheduled, restore } = scheduling();

    try {
      await janitor.onModuleInit();

      expect(scheduled).toHaveLength(1);
    } finally {
      restore();
      janitor.onModuleDestroy();
    }
  });

  it('should purge checkpoints on every sweep, not only at boot', async () => {
    const executed: SQL[] = [];
    const db = {
      $count: async () => 1,
      select: (fields: Parameters<QueryBuilder['select']>[0]) => new QueryBuilder().select(fields),
      execute: async (query: SQL) => {
        executed.push(query);
        return [];
      },
      delete: () => ({ where: async () => undefined }),
    };
    const janitor = new CheckpointJanitor({ getPostgresClient: () => db } as never);
    const { scheduled, restore } = scheduling();

    try {
      await janitor.onModuleInit();
      await flush();
      const atBoot = executed.length;
      expect(atBoot).toBeGreaterThan(0);
      expect(scheduled).toHaveLength(1);

      await scheduled[0]?.();

      expect(executed.length).toBe(2 * atBoot);
    } finally {
      restore();
      janitor.onModuleDestroy();
    }
  });
});
