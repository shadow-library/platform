/**
 * Importing npm packages
 */
import { and, asc, between, eq, isNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { EMPTY_STREAK_STATE, type StreakState } from '@modules/rules';
import {
  type Account,
  type DailyState,
  type DatabaseTransaction,
  type PrimaryDatabase,
  type Quest,
  type QuestLog,
  type RecoveryQuest,
  type ReturnerEvent,
  schema,
  syncStamped,
} from '@server/database';

/**
 * Defining types
 */

export interface AccountCurrency {
  timezone: string;
  lastHpDate: string | null;
  deletionState: Account.DeletionState;
}

export interface RecoveryQuestDraft {
  date: string;
  sourceQuestId: bigint | null;
  sourceQuestName: string;
  triggerLogIds: bigint[];
  isReturnerDay: boolean;
  expiresAt: Date;
}

export interface ReturnerEventDraft {
  date: string;
  lastActiveDate: string | null;
  daysAbsent: number;
  shieldTargetQuestId: bigint | null;
  shieldPending: boolean;
  intensityMode: Account.IntensityMode;
}

/**
 * Declaring the constants
 */

/**
 * Rollover is a system process: it runs for an account nobody is necessarily requesting as, so — like
 * `CommandLogRepository` and `AccountRepository` — it deliberately sits outside `OwnerScopedRepository`
 * and takes the account as an explicit argument on every call instead of an ambient one.
 */
@Injectable()
export class RolloverRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /** The same per-account advisory lock the command bus takes (§11.2), so a rollover day and a command can never interleave inside one another. */
  async runSerialized<T>(accountId: bigint, operation: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${accountId})`);
      return operation(tx);
    });
  }

  async readCurrency(accountId: bigint): Promise<AccountCurrency | null> {
    const [account] = await this.db
      .select({ timezone: schema.accounts.timezone, lastHpDate: schema.accounts.lastHpDate, deletionState: schema.accounts.deletionState })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId));
    return account ?? null;
  }

  async lockAccount(tx: DatabaseTransaction, accountId: bigint): Promise<Account.Row | null> {
    const [account] = await tx.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).for('update');
    return account ?? null;
  }

  async updateAccount(tx: DatabaseTransaction, accountId: bigint, values: Partial<typeof schema.accounts.$inferInsert>): Promise<void> {
    await tx
      .update(schema.accounts)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.accounts.id, accountId));
  }

  async lockDailyState(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<DailyState.Row | null> {
    const [state] = await tx
      .select()
      .from(schema.dailyStates)
      .where(and(eq(schema.dailyStates.accountId, accountId), eq(schema.dailyStates.date, date)))
      .for('update');
    return state ?? null;
  }

  async findDailyState(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<DailyState.Row | null> {
    const [state] = await tx
      .select()
      .from(schema.dailyStates)
      .where(and(eq(schema.dailyStates.accountId, accountId), eq(schema.dailyStates.date, date)));
    return state ?? null;
  }

  async listDailyStates(tx: DatabaseTransaction, accountId: bigint, from: string, to: string): Promise<DailyState.Row[]> {
    return tx
      .select()
      .from(schema.dailyStates)
      .where(and(eq(schema.dailyStates.accountId, accountId), between(schema.dailyStates.date, from, to)))
      .orderBy(asc(schema.dailyStates.date));
  }

  /** Every writer of a terminalized day carries `WHERE rollover_at IS NULL` (§10.4): the guard is the marker's whole point, so the upsert can never rewrite a closed day. */
  async upsertDailyState(tx: DatabaseTransaction, values: typeof schema.dailyStates.$inferInsert): Promise<void> {
    const { accountId: _accountId, date: _date, ...mutable } = values;
    await tx
      .insert(schema.dailyStates)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.dailyStates.accountId, schema.dailyStates.date],
        set: syncStamped(schema.dailyStates, mutable),
        setWhere: isNull(schema.dailyStates.rolloverAt),
      });
  }

  async listActiveQuests(tx: DatabaseTransaction, accountId: bigint): Promise<Quest.Row[]> {
    return tx
      .select()
      .from(schema.quests)
      .where(and(eq(schema.quests.accountId, accountId), eq(schema.quests.active, true)))
      .orderBy(asc(schema.quests.id));
  }

  async listQuestLogs(tx: DatabaseTransaction, accountId: bigint, from: string, to: string): Promise<QuestLog.Row[]> {
    return tx
      .select()
      .from(schema.questLogs)
      .where(and(eq(schema.questLogs.accountId, accountId), between(schema.questLogs.date, from, to)))
      .orderBy(asc(schema.questLogs.date));
  }

  /** A system miss never displaces a user's own outcome: the occurrence unique constraint absorbs the collision (§13.3, PRD §4.10 step 3). */
  async insertMiss(tx: DatabaseTransaction, values: typeof schema.questLogs.$inferInsert): Promise<QuestLog.Row | null> {
    const [log] = await tx
      .insert(schema.questLogs)
      .values(values)
      .onConflictDoNothing({ target: [schema.questLogs.accountId, schema.questLogs.questId, schema.questLogs.date] })
      .returning();
    return log ?? null;
  }

  async lockStreak(tx: DatabaseTransaction, accountId: bigint, questId: bigint): Promise<StreakState> {
    const [row] = await tx
      .select()
      .from(schema.questStreaks)
      .where(and(eq(schema.questStreaks.accountId, accountId), eq(schema.questStreaks.questId, questId)))
      .for('update');
    if (!row) return EMPTY_STREAK_STATE;
    return {
      currentDays: row.currentRunDays,
      longestDays: row.bestRunDays,
      shields: row.shieldsAvailable,
      completionsTowardShield: row.completionsTowardShield,
      pendingShieldGrant: 0,
    };
  }

  async writeStreak(tx: DatabaseTransaction, accountId: bigint, questId: bigint, date: string, state: StreakState): Promise<void> {
    const runStartDate = state.currentDays === 0 ? null : state.currentDays === 1 ? date : undefined;
    await tx
      .insert(schema.questStreaks)
      .values({
        accountId,
        questId,
        currentRunDays: state.currentDays,
        bestRunDays: state.longestDays,
        shieldsAvailable: state.shields,
        completionsTowardShield: state.completionsTowardShield,
        runStartDate: state.currentDays > 0 ? date : null,
        lastCountedDate: date,
      })
      .onConflictDoUpdate({
        target: [schema.questStreaks.accountId, schema.questStreaks.questId],
        set: syncStamped(schema.questStreaks, {
          currentRunDays: state.currentDays,
          bestRunDays: state.longestDays,
          shieldsAvailable: state.shields,
          completionsTowardShield: state.completionsTowardShield,
          ...(runStartDate === undefined ? {} : { runStartDate }),
          lastCountedDate: date,
        }),
      });
  }

  async insertShieldConsumption(tx: DatabaseTransaction, accountId: bigint, questId: bigint, date: string): Promise<void> {
    await tx
      .insert(schema.shieldConsumptions)
      .values({ accountId, questId, date })
      .onConflictDoNothing({ target: [schema.shieldConsumptions.accountId, schema.shieldConsumptions.questId, schema.shieldConsumptions.date] });
  }

  async listShieldedQuests(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<Set<bigint>> {
    const rows = await tx
      .select({ questId: schema.shieldConsumptions.questId })
      .from(schema.shieldConsumptions)
      .where(and(eq(schema.shieldConsumptions.accountId, accountId), eq(schema.shieldConsumptions.date, date)));
    return new Set(rows.map(row => row.questId));
  }

  /** PRD §4.10 step 4: expiry is silent — no penalty, no cascade, and no reopening of a Recovery already resolved by the user. */
  async expirePendingRecovery(tx: DatabaseTransaction, accountId: bigint, date: string): Promise<number> {
    const expired = await tx
      .update(schema.recoveryQuests)
      .set({ state: 'expired' })
      .where(and(eq(schema.recoveryQuests.accountId, accountId), eq(schema.recoveryQuests.date, date), eq(schema.recoveryQuests.state, 'pending')))
      .returning({ id: schema.recoveryQuests.id });
    return expired.length;
  }

  async insertRecoveryQuest(tx: DatabaseTransaction, accountId: bigint, draft: RecoveryQuestDraft): Promise<RecoveryQuest.Row | null> {
    const [recovery] = await tx
      .insert(schema.recoveryQuests)
      .values({ accountId, ...draft })
      .onConflictDoNothing({ target: [schema.recoveryQuests.accountId, schema.recoveryQuests.date] })
      .returning();
    return recovery ?? null;
  }

  async insertReturnerEvent(tx: DatabaseTransaction, accountId: bigint, draft: ReturnerEventDraft): Promise<ReturnerEvent.Row | null> {
    const [event] = await tx
      .insert(schema.returnerEvents)
      .values({ accountId, returnDate: draft.date, ...draft })
      .onConflictDoNothing({ target: [schema.returnerEvents.accountId, schema.returnerEvents.date] })
      .returning();
    return event ?? null;
  }

  async insertComebackEvent(tx: DatabaseTransaction, accountId: bigint, date: string, intensityMode: Account.IntensityMode, triggerKind: string | null): Promise<boolean> {
    const [event] = await tx
      .insert(schema.comebackEvents)
      .values({ accountId, date, kind: 'armed', triggerKind: triggerKind as (typeof schema.comebackEvents.$inferInsert)['triggerKind'], intensityMode })
      .onConflictDoNothing({ target: [schema.comebackEvents.accountId, schema.comebackEvents.date, schema.comebackEvents.kind] })
      .returning({ id: schema.comebackEvents.id });
    return Boolean(event);
  }
}
