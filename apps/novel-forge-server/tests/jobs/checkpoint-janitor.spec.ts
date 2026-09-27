import { describe, expect, it } from 'bun:test';
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
