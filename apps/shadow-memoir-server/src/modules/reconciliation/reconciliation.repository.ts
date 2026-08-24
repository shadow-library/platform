/**
 * Importing npm packages
 */
import { and, eq, exists, lt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type Account, type PrimaryDatabase, type Quest, type QuestLog, schema } from '@server/database';

/**
 * Defining types
 */

export interface AccountMirrorRow {
  accountId: bigint;
  totalXp: bigint;
  coins: number;
  statDiscipline: number;
  statBody: number;
  statWealth: number;
  statMind: number;
  level: number;
  sumXp: bigint;
  sumCoins: number;
  sumDiscipline: number;
  sumBody: number;
  sumWealth: number;
  sumMind: number;
}

export interface StreakSampleRow {
  accountId: bigint;
  questId: bigint;
  currentRunDays: number;
  bestRunDays: number;
  shieldsAvailable: number;
  completionsTowardShield: number;
}

export interface StreakLogRow {
  date: string;
  state: QuestLog.State;
  strictness: Quest.Strictness;
  intensityModeAtLog: Account.IntensityMode;
}

/**
 * Declaring the constants
 */

/**
 * Every method here reads or prunes across every account rather than one caller's own — the same
 * cross-account machine path `AccountRepository`/`ExpenseRepository` use for their own sweeps
 * (ARCHITECTURE §11.4, §26). Never an `OwnerScopedRepository`: reconciliation runs with no request context.
 */
@Injectable()
export class ReconciliationRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * One row per non-deleted account: its `accounts` mirror alongside the `SUM(hero_events)` the mirror
   * is supposed to equal (§11.4). Sums travel as text — Postgres returns `bigint`/`numeric` aggregates
   * as strings over the wire, and the caller parses with `BigInt`/`Number` rather than losing precision
   * to an implicit JS-number cast here.
   */
  async listAccountMirrors(): Promise<AccountMirrorRow[]> {
    const heroSums = this.db
      .select({
        accountId: schema.heroEvents.accountId,
        sumXp: sql<string>`COALESCE(SUM(${schema.heroEvents.xpDelta}), 0)::text`.as('sum_xp'),
        sumCoins: sql<number>`COALESCE(SUM(${schema.heroEvents.coinsDelta}), 0)::int`.as('sum_coins'),
        sumDiscipline: sql<number>`COALESCE(SUM(${schema.heroEvents.statDelta}) FILTER (WHERE ${schema.heroEvents.statAffinity} = 'discipline'), 0)::int`.as('sum_discipline'),
        sumBody: sql<number>`COALESCE(SUM(${schema.heroEvents.statDelta}) FILTER (WHERE ${schema.heroEvents.statAffinity} = 'body'), 0)::int`.as('sum_body'),
        sumWealth: sql<number>`COALESCE(SUM(${schema.heroEvents.statDelta}) FILTER (WHERE ${schema.heroEvents.statAffinity} = 'wealth'), 0)::int`.as('sum_wealth'),
        sumMind: sql<number>`COALESCE(SUM(${schema.heroEvents.statDelta}) FILTER (WHERE ${schema.heroEvents.statAffinity} = 'mind'), 0)::int`.as('sum_mind'),
      })
      .from(schema.heroEvents)
      .groupBy(schema.heroEvents.accountId)
      .as('hero_sums');

    const rows = await this.db
      .select({
        accountId: schema.accounts.id,
        totalXp: sql<string>`${schema.accounts.totalXp}::text`.as('total_xp'),
        coins: schema.accounts.coins,
        statDiscipline: schema.accounts.statDiscipline,
        statBody: schema.accounts.statBody,
        statWealth: schema.accounts.statWealth,
        statMind: schema.accounts.statMind,
        level: schema.accounts.level,
        sumXp: sql<string>`COALESCE(${heroSums.sumXp}, '0')`,
        sumCoins: sql<number>`COALESCE(${heroSums.sumCoins}, 0)`,
        sumDiscipline: sql<number>`COALESCE(${heroSums.sumDiscipline}, 0)`,
        sumBody: sql<number>`COALESCE(${heroSums.sumBody}, 0)`,
        sumWealth: sql<number>`COALESCE(${heroSums.sumWealth}, 0)`,
        sumMind: sql<number>`COALESCE(${heroSums.sumMind}, 0)`,
      })
      .from(schema.accounts)
      .leftJoin(heroSums, eq(heroSums.accountId, schema.accounts.id))
      .where(eq(schema.accounts.deletionState, 'none'));

    return rows.map(row => ({ ...row, totalXp: BigInt(row.totalXp), sumXp: BigInt(row.sumXp) }));
  }

  /** Accounts whose day-close walk looks stuck: `last_hp_date` lags the lag window, yet the account kept issuing commands past that window — activity a healthy account's lazy catch-up (§13.1) would have absorbed. */
  async findWedgedAccounts(lagDays: number, limit: number): Promise<bigint[]> {
    const lagInterval = sql`(${lagDays} || ' days')::interval`;
    const rows = await this.db
      .select({ accountId: schema.accounts.id })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.deletionState, 'none'),
          sql`${schema.accounts.lastHpDate} IS NOT NULL`,
          sql`${schema.accounts.lastHpDate}::date < (current_date - ${lagDays}::int)`,
          exists(
            this.db
              .select({ one: sql`1` })
              .from(schema.commandLog)
              .where(and(eq(schema.commandLog.accountId, schema.accounts.id), sql`${schema.commandLog.appliedAt} > ${schema.accounts.lastHpDate}::timestamptz + ${lagInterval}`)),
          ),
        ),
      )
      .limit(limit);
    return rows.map(row => row.accountId);
  }

  /** A fresh random sample every run (§26) — `ORDER BY random()` is fine at this scale and never repeats a fixed set of accounts week over week. */
  async sampleStreaks(limit: number): Promise<StreakSampleRow[]> {
    return this.db
      .select({
        accountId: schema.questStreaks.accountId,
        questId: schema.questStreaks.questId,
        currentRunDays: schema.questStreaks.currentRunDays,
        bestRunDays: schema.questStreaks.bestRunDays,
        shieldsAvailable: schema.questStreaks.shieldsAvailable,
        completionsTowardShield: schema.questStreaks.completionsTowardShield,
      })
      .from(schema.questStreaks)
      .innerJoin(schema.accounts, and(eq(schema.accounts.id, schema.questStreaks.accountId), eq(schema.accounts.deletionState, 'none')))
      .orderBy(sql`random()`)
      .limit(limit);
  }

  async findQuestStreakOptIn(questId: bigint): Promise<boolean | null> {
    const [quest] = await this.db.select({ optionalStreakOptIn: schema.quests.optionalStreakOptIn }).from(schema.quests).where(eq(schema.quests.id, questId));
    return quest?.optionalStreakOptIn ?? null;
  }

  /** Full log history for one (account, quest) pair, oldest first — the same input order `recomputeStreak` folds over live. */
  async listQuestLogHistory(accountId: bigint, questId: bigint): Promise<StreakLogRow[]> {
    return this.db
      .select({ date: schema.questLogs.date, state: schema.questLogs.state, strictness: schema.questLogs.strictness, intensityModeAtLog: schema.questLogs.intensityModeAtLog })
      .from(schema.questLogs)
      .where(and(eq(schema.questLogs.accountId, accountId), eq(schema.questLogs.questId, questId)))
      .orderBy(schema.questLogs.date, schema.questLogs.id);
  }

  /** One bounded batch of the oldest rows past retention, deleted by exact primary key — never a blind `DELETE ... LIMIT`, which Postgres doesn't support directly. Returns the count actually removed. */
  async pruneCommandLogBatch(cutoff: Date, batchSize: number): Promise<number> {
    const doomed = await this.db
      .select({ accountId: schema.commandLog.accountId, commandId: schema.commandLog.commandId })
      .from(schema.commandLog)
      .where(lt(schema.commandLog.appliedAt, cutoff))
      .limit(batchSize);
    if (doomed.length === 0) return 0;

    for (const row of doomed) {
      await this.db.delete(schema.commandLog).where(and(eq(schema.commandLog.accountId, row.accountId), eq(schema.commandLog.commandId, row.commandId)));
    }
    return doomed.length;
  }
}
