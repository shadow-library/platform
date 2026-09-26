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

    expect(deletes.map(entry => entry.table)).toEqual([schema.jobEvents]);
    const query = dialect.sqlToQuery(deletes[0]?.where as SQL);
    expect(query.sql).toBe('"job_events"."job_id" in (select "id" from "jobs" where ("jobs"."status" in ($1, $2, $3) and "jobs"."updated_at" < $4))');
    expect(query.params.slice(0, 3)).toEqual(['done', 'failed', 'cancelled']);
    const cutoff = new Date(String(query.params[3]).replace(' ', 'T').replace(/Z?$/, 'Z'));
    expect(cutoff.getTime()).toBeLessThanOrEqual(before - 7 * 86_400_000);
    expect(cutoff.getTime()).toBeGreaterThan(before - 7 * 86_400_000 - 60_000);
  });
});
