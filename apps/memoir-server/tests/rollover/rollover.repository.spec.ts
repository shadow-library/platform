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
});
