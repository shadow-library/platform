import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { EMPTY_PROGRESS_COUNTERS, type ProgressCounters } from '@modules/rules';
import { type DatabaseTransaction, type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * The counters this table actually stores — everything `ProgressCounters` needs except the fields
 * already mirrored on `accounts` (`totalXp`, `level`, `stats`) and `reschedulesWithReasonIn90Days`,
 * which is a rolling window computed live off `reschedule_events` rather than an incremental total
 * (ARCHITECTURE §26, T-21 module report).
 */
export type IncrementalCounters = Omit<ProgressCounters, 'totalXp' | 'level' | 'stats' | 'reschedulesWithReasonIn90Days'>;

export const EMPTY_INCREMENTAL_COUNTERS: IncrementalCounters = {
  questsCompleted: EMPTY_PROGRESS_COUNTERS.questsCompleted,
  completionsByStrictness: EMPTY_PROGRESS_COUNTERS.completionsByStrictness,
  longestStreakDays: EMPTY_PROGRESS_COUNTERS.longestStreakDays,
  longestAnchorStreakDays: EMPTY_PROGRESS_COUNTERS.longestAnchorStreakDays,
  questsReachingSilverStreak: EMPTY_PROGRESS_COUNTERS.questsReachingSilverStreak,
  subscriptionsConfirmed: EMPTY_PROGRESS_COUNTERS.subscriptionsConfirmed,
  receiptsScanned: EMPTY_PROGRESS_COUNTERS.receiptsScanned,
  fullHpDays: EMPTY_PROGRESS_COUNTERS.fullHpDays,
  crownsBanked: EMPTY_PROGRESS_COUNTERS.crownsBanked,
  lockedDaysCleared: EMPTY_PROGRESS_COUNTERS.lockedDaysCleared,
  comebackBonusesClaimed: EMPTY_PROGRESS_COUNTERS.comebackBonusesClaimed,
  returnerRitualsCompleted: EMPTY_PROGRESS_COUNTERS.returnerRitualsCompleted,
  completionsAfterReturner: EMPTY_PROGRESS_COUNTERS.completionsAfterReturner,
  reasonTaggedEvents: EMPTY_PROGRESS_COUNTERS.reasonTaggedEvents,
  activeDays: EMPTY_PROGRESS_COUNTERS.activeDays,
};

/** Internal-only bookkeeping alongside the counters that isn't part of the rules catalogue's input shape. */
interface CountersEnvelope {
  counters: IncrementalCounters;
  /** The most recent calendar date `activeDays` already counted, so a second hold-state completion on the same day is a no-op. */
  lastActiveCountedDate: string | null;
  /** Set when a Returner ritual fires and cleared by the first quest completion after it — the `returner` title's trigger (PRD §4.8). */
  returnerPending: boolean;
}

const EMPTY_ENVELOPE: CountersEnvelope = { counters: EMPTY_INCREMENTAL_COUNTERS, lastActiveCountedDate: null, returnerPending: false };

function normalize(raw: unknown): CountersEnvelope {
  if (raw === null || typeof raw !== 'object') return EMPTY_ENVELOPE;
  const value = raw as Partial<CountersEnvelope>;
  return {
    counters: { ...EMPTY_INCREMENTAL_COUNTERS, ...(value.counters as Partial<IncrementalCounters> | undefined) },
    lastActiveCountedDate: value.lastActiveCountedDate ?? null,
    returnerPending: value.returnerPending ?? false,
  };
}

/**
 * Declaring the constants
 */

/**
 * One row per account (ARCHITECTURE §26's incremental Title/Achievement projection). Every read/write
 * here takes the caller's own transaction and `accountId` explicitly — the same shape as `HeroLedger`
 * — because every call site is already inside a command's per-account-serialized transaction, so there
 * is no independent race to guard against beyond what that serialization already provides.
 */
@Injectable()
export class ProgressCountersRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /** The one call site outside a command transaction (OCR scanning, ARCHITECTURE §14.3) that still needs to write through this projection. */
  transaction<T>(operation: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(operation);
  }

  async readForUpdate(tx: DatabaseTransaction, accountId: bigint): Promise<CountersEnvelope> {
    const [row] = await tx.select().from(schema.progressCounters).where(eq(schema.progressCounters.accountId, accountId)).for('update');
    return normalize(row?.counters);
  }

  async write(tx: DatabaseTransaction, accountId: bigint, envelope: CountersEnvelope): Promise<void> {
    await tx
      .insert(schema.progressCounters)
      .values({ accountId, counters: envelope, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.progressCounters.accountId, set: { counters: envelope, updatedAt: new Date() } });
  }
}

export type { CountersEnvelope };
