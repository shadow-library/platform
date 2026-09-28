import { describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { type AccountContext } from '@modules/auth';
import { type HeroLedger } from '@modules/commands';
import { type GrantsRepository, type ProgressCountersRepository, ProgressionService } from '@modules/progression';
import { QuestLogRepository } from '@modules/quests';
import { type DatabaseTransaction, schema } from '@server/database';

const db = drizzle.mock({ schema });
const tx = db as unknown as DatabaseTransaction;

async function attemptedQuery(run: () => Promise<unknown>): Promise<{ sql: string; params: unknown[] }> {
  const failure = await run().then(
    () => null,
    (error: unknown) => error,
  );
  if (!(failure instanceof Error) || !('query' in failure) || !('params' in failure)) throw new Error('expected the mock driver to refuse the query');
  return { sql: String(failure.query), params: failure.params as unknown[] };
}

describe('QuestLogRepository.rescheduleCountInWindow', () => {
  const accountContext = { getAccountId: () => 1n } as unknown as AccountContext;
  const repository = new QuestLogRepository(new FakeDatabaseService({ postgres: db }), accountContext);

  it('should count only reschedules between the window start and the occurrence, never later ones', async () => {
    const query = await attemptedQuery(() => repository.rescheduleCountInWindow(tx, 10n, '2026-03-04', '2026-03-10'));

    expect(query.sql).toContain('"reschedule_events"."date" between $3 and $4');
    expect(query.params).toEqual([1n, 10n, '2026-03-04', '2026-03-10']);
  });
});

describe('ProgressionService honest planner window', () => {
  const service = new ProgressionService({} as ProgressCountersRepository, {} as GrantsRepository, {} as HeroLedger);

  it('should count only reasoned reschedules inside the 90 days ending on the evaluated date', async () => {
    const query = await attemptedQuery(() => service['countReschedulesWithReason'](tx, 1n, '2026-03-10'));

    expect(query.sql).toContain('"reschedule_events"."date" between $2 and $3');
    expect(query.params).toEqual([1n, '2025-12-11', '2026-03-10']);
  });
});
