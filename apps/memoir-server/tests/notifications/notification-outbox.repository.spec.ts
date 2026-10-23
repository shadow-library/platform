import { describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { NotificationOutboxRepository } from '@modules/notifications/notification-outbox.repository';
import { schema } from '@server/database';

async function attemptedQuery(run: () => Promise<unknown>): Promise<string> {
  const failure = await run().then(
    () => null,
    (error: unknown) => error,
  );
  if (!(failure instanceof Error) || !('query' in failure)) throw new Error('expected the mock driver to refuse the query');
  return String(failure.query);
}

describe('NotificationOutboxRepository', () => {
  const repository = new NotificationOutboxRepository(new FakeDatabaseService({ postgres: drizzle.mock({ schema }) }));

  it('should push next_attempt_at past the lease in the same update that claims the row', async () => {
    const query = await attemptedQuery(() => repository.claimNext());

    expect(query).toContain('"attempts" = "notification_outbox"."attempts" + 1');
    expect(query).toContain('"next_attempt_at" = now() + make_interval(mins => $1::int)');
    expect(query).toContain('FOR UPDATE SKIP LOCKED');
  });
});
