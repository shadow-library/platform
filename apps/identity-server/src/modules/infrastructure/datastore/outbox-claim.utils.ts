import { and, eq, lt, type SQL, sql } from 'drizzle-orm';

import { type PrimaryDatabase } from './datastore.module';
import { notificationOutbox, oidcLogoutDeliveries, webhookDeliveries } from './schemas';

export type OutboxTable = typeof notificationOutbox | typeof oidcLogoutDeliveries | typeof webhookDeliveries;

const MIN_CLAIM_LEASE_MS = 5 * 60_000;
const RECOVERED_ERROR = 'recovered after its claim lease expired';

/** A batch is claimed in one statement and sent one row at a time, so the last row's lease has to outlive every send queued ahead of it. */
export function claimLeaseFor(batchSize: number, deliveryTimeoutMs: number): number {
  return Math.max(MIN_CLAIM_LEASE_MS, 2 * batchSize * deliveryTimeoutMs);
}

/** A NULL `claimed_at` was claimed by a replica predating the column; its due `next_attempt_at` is a lower bound on that claim time. */
export function expiredClaim(table: OutboxTable, leaseMs: number): SQL {
  return and(eq(table.status, 'SENDING'), lt(sql`coalesce(${table.claimedAt}, ${table.nextAttemptAt})`, sql`now() - make_interval(secs => ${leaseMs / 1000})`)) as SQL;
}

/** Only an expired lease is reclaimed: during a rolling deploy another replica may still be sending rows it claimed moments ago. */
export async function recoverExpiredClaims(db: Pick<PrimaryDatabase, 'update'>, table: OutboxTable, leaseMs: number): Promise<number> {
  const recovered = await db.update(table).set({ status: 'FAILED', claimedAt: null, lastError: RECOVERED_ERROR }).where(expiredClaim(table, leaseMs)).returning({ id: table.id });
  return recovered.length;
}
