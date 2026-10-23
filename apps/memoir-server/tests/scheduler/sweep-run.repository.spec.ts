import { describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { SweepRunRepository } from '@modules/scheduler';
import { schema } from '@server/database';

async function attemptedQuery(run: () => Promise<unknown>): Promise<{ sql: string; params: unknown[] }> {
  const failure = await run().then(
    () => null,
    (error: unknown) => error,
  );
  if (!(failure instanceof Error) || !('query' in failure)) throw new Error('expected the mock driver to refuse the query');
  return { sql: String(failure.query), params: 'params' in failure ? (failure.params as unknown[]) : [] };
}

describe('SweepRunRepository', () => {
  const repository = new SweepRunRepository(new FakeDatabaseService({ postgres: drizzle.mock({ schema }) }));

  it('should claim only when the stored run is at least one cadence old in database time', async () => {
    const query = await attemptedQuery(() => repository.claim('notification-outbox-drain', 90_000));

    expect(query.sql).toContain('set "last_run_at" = now()');
    expect(query.sql).toContain('"sweep_runs"."name" = $1');
    expect(query.sql).toContain('"sweep_runs"."last_run_at" <= now() - make_interval(secs => $2::float8)');
    expect(query.sql).toContain('returning "last_run_at"');
    expect(query.params).toEqual(['notification-outbox-drain', 90]);
  });

  it('should seed without overwriting a run another replica already recorded, returning the stored run', async () => {
    const query = await attemptedQuery(() => repository.seed(['a', 'b']));

    expect(query.sql).toContain('insert into "sweep_runs"');
    expect(query.sql).toContain('on conflict ("name") do update set "name" = excluded.name');
    expect(query.sql).not.toContain('"last_run_at" = ');
    expect(query.sql).toContain('returning "name", "last_run_at"');
    expect(query.params).toEqual(['a', 'b']);
  });
});
