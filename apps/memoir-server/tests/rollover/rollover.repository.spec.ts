import { describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { RolloverRepository } from '@modules/rollover';
import { type DatabaseTransaction, schema } from '@server/database';

const db = drizzle.mock({ schema });
const tx = db as unknown as DatabaseTransaction;

async function attemptedQuery(run: () => Promise<unknown>): Promise<string> {
  const failure = await run().then(
    () => null,
    (error: unknown) => error,
  );
  if (!(failure instanceof Error) || !('query' in failure)) throw new Error('expected the mock driver to refuse the query');
  return String(failure.query);
}

describe('RolloverRepository', () => {
  const repository = new RolloverRepository(new FakeDatabaseService({ postgres: db }));

  it('should expire every pending Recovery dated on or before the closing day, so one stranded on a skipped day still expires', async () => {
    const query = await attemptedQuery(() => repository.expirePendingRecovery(tx, 1n, '2026-03-10'));

    expect(query).toContain('"recovery_quests"."date" <= $3');
    expect(query).toContain('"recovery_quests"."state" = $4');
  });

  it('should insert a day’s misses as one statement that leaves a user’s own outcome in place', async () => {
    const miss = {
      accountId: 1n,
      date: '2026-03-10',
      state: 'missed' as const,
      statAffinity: 'body' as const,
      strictness: 'routine' as const,
      intensityModeAtLog: 'standard' as const,
      crownSliceWeight: '1.00',
      rulesetVersion: 1,
    };
    const query = await attemptedQuery(() =>
      repository.insertMisses(
        tx,
        [10n, 11n, 12n].map(questId => ({ ...miss, questId })),
      ),
    );

    expect(query.match(/insert into "quest_logs"/g)).toHaveLength(1);
    expect(query).toContain('on conflict ("account_id","quest_id","date") do nothing');
  });

  it('should lock every named streak in one read and skip the database when none is named', async () => {
    const query = await attemptedQuery(() => repository.lockStreaks(tx, 1n, [10n, 11n]));

    expect(query).toContain('"quest_streaks"."quest_id" in ($2, $3)');
    expect(query).toContain('for update');
    expect(await repository.lockStreaks(tx, 1n, [])).toEqual(new Map());
    expect(await repository.insertMisses(tx, [])).toEqual([]);
  });
});
