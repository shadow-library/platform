/**
 * Importing npm packages
 */
import { and, eq, gte, inArray, type SQL } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { RolePoolService, schema } from '@server/database';

/**
 * Defining types
 */

export type Rows = Record<string, unknown>[];

/**
 * Declaring the constants
 */

/**
 * The §15.5 read scope, expressed one class at a time on the `memoir_ai` pool. The grant matrix is the
 * outer bound and these methods are the inner one: `includeText` and the health/journal split exist so
 * consent decides what is read, not merely what is readable. Every select names its columns — the role
 * holds column-limited grants on `accounts` and `expenses`, and `SELECT *` would ask for columns it is
 * denied and fail the whole assembly.
 */
@Injectable()
export class AiReadRepository {
  constructor(private readonly rolePools: RolePoolService) {}

  private db(): ReturnType<RolePoolService['getPool']> {
    return this.rolePools.getPool('memoir_ai');
  }

  /** Free tier reads a trailing window, paid reads everything (PRD §6.4); a null start is the paid case, not "no filter configured". */
  private window(column: SQL | Parameters<typeof gte>[0], windowStart: string | null): SQL | undefined {
    return windowStart === null ? undefined : gte(column, windowStart);
  }

  async listQuests(accountId: bigint): Promise<Rows> {
    return this.db()
      .select({
        id: schema.quests.id,
        name: schema.quests.name,
        startTimeMin: schema.quests.startTimeMin,
        durationMin: schema.quests.durationMin,
        statAffinity: schema.quests.statAffinity,
        strictness: schema.quests.strictness,
        recurrence: schema.quests.recurrence,
        moduleLink: schema.quests.moduleLink,
        reminderEnabled: schema.quests.reminderEnabled,
        reminderLeadMin: schema.quests.reminderLeadMin,
        active: schema.quests.active,
      })
      .from(schema.quests)
      .where(eq(schema.quests.accountId, accountId));
  }

  async listQuestLogs(accountId: bigint, windowStart: string | null, includeText: boolean): Promise<Rows> {
    const base = {
      questId: schema.questLogs.questId,
      date: schema.questLogs.date,
      state: schema.questLogs.state,
      xpAwarded: schema.questLogs.xpAwarded,
      coinsAwarded: schema.questLogs.coinsAwarded,
      strictness: schema.questLogs.strictness,
      intensityModeAtLog: schema.questLogs.intensityModeAtLog,
      reasonTag: schema.questLogs.reasonTag,
      rescheduledToMin: schema.questLogs.rescheduledToMin,
      postponedToDate: schema.questLogs.postponedToDate,
      performedAt: schema.questLogs.performedAt,
    };
    const columns = includeText ? { ...base, reasonNote: schema.questLogs.reasonNote, reflectionText: schema.questLogs.reflectionText } : base;
    return this.db()
      .select(columns)
      .from(schema.questLogs)
      .where(and(eq(schema.questLogs.accountId, accountId), this.window(schema.questLogs.date, windowStart)));
  }

  async listHeroEvents(accountId: bigint, windowStart: string | null): Promise<Rows> {
    return this.db()
      .select({
        type: schema.heroEvents.type,
        questId: schema.heroEvents.questId,
        state: schema.heroEvents.state,
        xpDelta: schema.heroEvents.xpDelta,
        coinsDelta: schema.heroEvents.coinsDelta,
        statAffinity: schema.heroEvents.statAffinity,
        statDelta: schema.heroEvents.statDelta,
        levelAfter: schema.heroEvents.levelAfter,
        achievementId: schema.heroEvents.achievementId,
        date: schema.heroEvents.date,
      })
      .from(schema.heroEvents)
      .where(and(eq(schema.heroEvents.accountId, accountId), this.window(schema.heroEvents.date, windowStart)));
  }

  async listDailyStates(accountId: bigint, windowStart: string | null): Promise<Rows> {
    return this.db()
      .select({
        date: schema.dailyStates.date,
        intensityMode: schema.dailyStates.intensityMode,
        hpStart: schema.dailyStates.hpStart,
        hpEnd: schema.dailyStates.hpEnd,
        hpMax: schema.dailyStates.hpMax,
        crownXpGranted: schema.dailyStates.crownXpGranted,
        crownBankedXp: schema.dailyStates.crownBankedXp,
        momentumBucket: schema.dailyStates.momentumBucket,
        missedCount: schema.dailyStates.missedCount,
      })
      .from(schema.dailyStates)
      .where(and(eq(schema.dailyStates.accountId, accountId), this.window(schema.dailyStates.date, windowStart)));
  }

  /**
   * The compassion-mechanic trail (§15.5's `recovery_quests`, `comeback_events`, `returner_events`,
   * `shield_consumptions`) plus the earned catalogues, read as one class because they answer one
   * question — how the account behaved around its breaks.
   */
  async listProgressionEvents(accountId: bigint, windowStart: string | null, includeReflection: boolean): Promise<Rows> {
    const recoveryColumns = {
      date: schema.recoveryQuests.date,
      sourceQuestId: schema.recoveryQuests.sourceQuestId,
      state: schema.recoveryQuests.state,
      isReturnerDay: schema.recoveryQuests.isReturnerDay,
      completedAt: schema.recoveryQuests.completedAt,
    };
    const [recoveries, comebacks, returners, shields, achievements, titles] = await Promise.all([
      this.db()
        .select(includeReflection ? { ...recoveryColumns, reflectionText: schema.recoveryQuests.reflectionText } : recoveryColumns)
        .from(schema.recoveryQuests)
        .where(and(eq(schema.recoveryQuests.accountId, accountId), this.window(schema.recoveryQuests.date, windowStart))),
      this.db()
        .select({ date: schema.comebackEvents.date, kind: schema.comebackEvents.kind, xpBonus: schema.comebackEvents.xpBonus, coinBonus: schema.comebackEvents.coinBonus })
        .from(schema.comebackEvents)
        .where(and(eq(schema.comebackEvents.accountId, accountId), this.window(schema.comebackEvents.date, windowStart))),
      this.db()
        .select({ date: schema.returnerEvents.date, daysAbsent: schema.returnerEvents.daysAbsent, shieldPending: schema.returnerEvents.shieldPending })
        .from(schema.returnerEvents)
        .where(and(eq(schema.returnerEvents.accountId, accountId), this.window(schema.returnerEvents.date, windowStart))),
      this.db()
        .select({ date: schema.shieldConsumptions.date, questId: schema.shieldConsumptions.questId })
        .from(schema.shieldConsumptions)
        .where(and(eq(schema.shieldConsumptions.accountId, accountId), this.window(schema.shieldConsumptions.date, windowStart))),
      this.db()
        .select({ achievementId: schema.achievementsEarned.achievementId, earnedAt: schema.achievementsEarned.earnedAt })
        .from(schema.achievementsEarned)
        .where(eq(schema.achievementsEarned.accountId, accountId)),
      this.db()
        .select({ titleId: schema.titlesEarned.titleId, earnedAt: schema.titlesEarned.earnedAt })
        .from(schema.titlesEarned)
        .where(eq(schema.titlesEarned.accountId, accountId)),
    ]);

    return [
      ...recoveries.map(row => ({ entity: 'recovery_quest', ...row })),
      ...comebacks.map(row => ({ entity: 'comeback', ...row })),
      ...returners.map(row => ({ entity: 'returner', ...row })),
      ...shields.map(row => ({ entity: 'shield_consumption', ...row })),
      ...achievements.map(row => ({ entity: 'achievement', ...row })),
      ...titles.map(row => ({ entity: 'title', ...row })),
    ];
  }

  /** `receipt_ref` is absent by grant as well as by selection (§15.5): the worker has no reason to know an image exists. */
  async listFinance(accountId: bigint, windowStart: string | null): Promise<Rows> {
    const [expenses, subscriptions] = await Promise.all([
      this.db()
        .select({
          amountMinor: schema.expenses.amountMinor,
          currency: schema.expenses.currency,
          homeAmountMinor: schema.expenses.homeAmountMinor,
          categoryId: schema.expenses.categoryId,
          merchant: schema.expenses.merchant,
          occurredOn: schema.expenses.occurredOn,
          source: schema.expenses.source,
          linkedQuestId: schema.expenses.linkedQuestId,
        })
        .from(schema.expenses)
        .where(and(eq(schema.expenses.accountId, accountId), this.window(schema.expenses.occurredOn, windowStart))),
      this.db()
        .select({
          name: schema.subscriptions.name,
          amountMinor: schema.subscriptions.amountMinor,
          currency: schema.subscriptions.currency,
          frequency: schema.subscriptions.frequency,
          categoryId: schema.subscriptions.categoryId,
          active: schema.subscriptions.active,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.accountId, accountId)),
    ]);
    return [...expenses.map(row => ({ entity: 'expense', ...row })), ...subscriptions.map(row => ({ entity: 'subscription', ...row }))];
  }

  /**
   * Health-flagged metrics are a separate consent class (PRD §6.7, §18), so the split happens in the
   * query rather than after it — an un-consented health entry is never fetched, not fetched and filtered.
   */
  async listMetrics(accountId: bigint, windowStart: string | null, health: boolean): Promise<Rows> {
    const metrics = await this.db()
      .select({ id: schema.metrics.id, name: schema.metrics.name, unit: schema.metrics.unit, valueType: schema.metrics.valueType, direction: schema.metrics.direction })
      .from(schema.metrics)
      .where(and(eq(schema.metrics.accountId, accountId), eq(schema.metrics.isHealth, health)));
    if (metrics.length === 0) return [];

    const entries = await this.db()
      .select({ metricId: schema.metricEntries.metricId, date: schema.metricEntries.date, value: schema.metricEntries.value, source: schema.metricEntries.source })
      .from(schema.metricEntries)
      .where(
        and(
          eq(schema.metricEntries.accountId, accountId),
          inArray(
            schema.metricEntries.metricId,
            metrics.map(metric => metric.id),
          ),
          this.window(schema.metricEntries.date, windowStart),
        ),
      );
    return [...metrics.map(row => ({ entity: 'metric', ...row })), ...entries.map(row => ({ entity: 'metric_entry', ...row }))];
  }

  /** Body mass is health-class data (`weights.kg` carries the `health` sensitivity classification), so it rides the health consent rather than the meals class it sits next to in the schema. */
  async listWeights(accountId: bigint, windowStart: string | null): Promise<Rows> {
    return this.db()
      .select({ date: schema.weights.date, kg: schema.weights.kg })
      .from(schema.weights)
      .where(and(eq(schema.weights.accountId, accountId), this.window(schema.weights.date, windowStart)));
  }

  async listMeals(accountId: bigint, windowStart: string | null): Promise<Rows> {
    return this.db()
      .select({ date: schema.meals.date, name: schema.meals.name, calories: schema.meals.calories, mealType: schema.meals.mealType })
      .from(schema.meals)
      .where(and(eq(schema.meals.accountId, accountId), this.window(schema.meals.date, windowStart)));
  }

  async listSideQuests(accountId: bigint, windowStart: string | null): Promise<Rows> {
    return this.db()
      .select({ date: schema.sideQuests.date, name: schema.sideQuests.name, statAffinity: schema.sideQuests.statAffinity, xpAwarded: schema.sideQuests.xpAwarded })
      .from(schema.sideQuests)
      .where(and(eq(schema.sideQuests.accountId, accountId), this.window(schema.sideQuests.date, windowStart)));
  }

  /** Called only when `journal_reflection_reason` consent is live (PRD §6.7's listed acceptance criterion). */
  async listJournal(accountId: bigint, windowStart: string | null): Promise<Rows> {
    return this.db()
      .select({ date: schema.journalEntries.date, text: schema.journalEntries.text, mood: schema.journalEntries.mood, tags: schema.journalEntries.tags })
      .from(schema.journalEntries)
      .where(and(eq(schema.journalEntries.accountId, accountId), this.window(schema.journalEntries.date, windowStart)));
  }
}
