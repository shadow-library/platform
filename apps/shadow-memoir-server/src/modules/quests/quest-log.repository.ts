/**
 * Importing npm packages
 */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type Account, type DatabaseTransaction, type Quest, type QuestLog, schema, syncStamped } from '@server/database';

/**
 * Defining types
 */

/** The terminal snapshot every `quest_logs` write carries, per ARCHITECTURE §10.3's snapshot columns. */
export interface QuestLogWrite {
  questId: bigint;
  date: string;
  state: QuestLog.State;
  xpAwarded: number;
  coinsAwarded: number;
  statAffinity: Quest.StatAffinity;
  strictness: Quest.Strictness;
  intensityModeAtLog: Account.IntensityMode;
  crownSliceWeight: string;
  rulesetVersion: number;
  reasonTag?: QuestLog.ReasonTag | null;
  reasonNote?: string | null;
  rescheduledToMin?: number | null;
  postponedToDate?: string | null;
  performedAt?: Date | null;
}

/**
 * Declaring the constants
 */

/** States that never occupy the (account, quest, date) row against a genuine user action: a system miss (T-19) and a bare reschedule marker both yield to the real outcome. */
const YIELDING_STATES: readonly QuestLog.State[] = ['missed', 'rescheduled'];

@Injectable()
export class QuestLogRepository extends OwnerScopedRepository {
  async findByOccurrence(questId: bigint, date: string): Promise<QuestLog.Row | null> {
    const rows = (await this.scoped(schema.questLogs, eq(schema.questLogs.questId, questId), eq(schema.questLogs.date, date))) as QuestLog.Row[];
    return rows[0] ?? null;
  }

  /**
   * The T-13 convergence upsert: a fresh row always lands; a conflicting row only takes the new terminal
   * outcome when it currently holds a system miss or a bare reschedule marker (`YIELDING_STATES`) — a
   * genuine prior action (or another concurrent winner) is left untouched, and the caller reads `null` as
   * "converge to what's already there" (ARCHITECTURE §11.2/§11.3, PRD §3.3).
   */
  async upsertTerminal(tx: DatabaseTransaction, write: QuestLogWrite): Promise<QuestLog.Row | null> {
    const accountId = this.requireAccountId();
    const [log] = await tx
      .insert(schema.questLogs)
      .values({
        accountId,
        questId: write.questId,
        date: write.date,
        state: write.state,
        xpAwarded: write.xpAwarded,
        coinsAwarded: write.coinsAwarded,
        statAffinity: write.statAffinity,
        strictness: write.strictness,
        intensityModeAtLog: write.intensityModeAtLog,
        crownSliceWeight: write.crownSliceWeight,
        rulesetVersion: write.rulesetVersion,
        reasonTag: write.reasonTag ?? null,
        reasonNote: write.reasonNote ?? null,
        rescheduledToMin: write.rescheduledToMin ?? null,
        postponedToDate: write.postponedToDate ?? null,
        performedAt: write.performedAt ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.questLogs.accountId, schema.questLogs.questId, schema.questLogs.date],
        set: syncStamped(schema.questLogs, {
          state: write.state,
          xpAwarded: write.xpAwarded,
          coinsAwarded: write.coinsAwarded,
          statAffinity: write.statAffinity,
          strictness: write.strictness,
          intensityModeAtLog: write.intensityModeAtLog,
          crownSliceWeight: write.crownSliceWeight,
          rulesetVersion: write.rulesetVersion,
          reasonTag: write.reasonTag ?? null,
          reasonNote: write.reasonNote ?? null,
          rescheduledToMin: write.rescheduledToMin ?? null,
          postponedToDate: write.postponedToDate ?? null,
          performedAt: write.performedAt ?? null,
          updatedAt: new Date(),
        }),
        setWhere: inArray(schema.questLogs.state, YIELDING_STATES),
      })
      .returning();
    return log ?? null;
  }

  /**
   * `quest.reschedule`'s own upsert only ever yields to a system miss — a bare reschedule can never
   * follow another reschedule (`reschedule_events`'s own unique key refuses the second attempt outright)
   * and must never clobber a real terminal outcome that raced ahead of it.
   */
  async upsertReschedule(tx: DatabaseTransaction, write: QuestLogWrite): Promise<QuestLog.Row | null> {
    const accountId = this.requireAccountId();
    const [log] = await tx
      .insert(schema.questLogs)
      .values({
        accountId,
        questId: write.questId,
        date: write.date,
        state: 'rescheduled',
        xpAwarded: 0,
        coinsAwarded: 0,
        statAffinity: write.statAffinity,
        strictness: write.strictness,
        intensityModeAtLog: write.intensityModeAtLog,
        crownSliceWeight: write.crownSliceWeight,
        rulesetVersion: write.rulesetVersion,
        rescheduledToMin: write.rescheduledToMin ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.questLogs.accountId, schema.questLogs.questId, schema.questLogs.date],
        set: syncStamped(schema.questLogs, { state: 'rescheduled', rescheduledToMin: write.rescheduledToMin ?? null, updatedAt: new Date() }),
        setWhere: eq(schema.questLogs.state, 'missed'),
      })
      .returning();
    return log ?? null;
  }

  /** Attaches a reason tag/note or a Recovery reflection post-hoc, within the 7-day window; terminal fields are never touched here (PRD §3.3). */
  async attachReason(
    tx: DatabaseTransaction,
    questLogId: bigint,
    fields: { reasonTag?: QuestLog.ReasonTag | null; reasonNote?: string | null; reflectionText?: string | null },
  ): Promise<QuestLog.Row | null> {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (fields.reasonTag !== undefined) values['reasonTag'] = fields.reasonTag;
    if (fields.reasonNote !== undefined) values['reasonNote'] = fields.reasonNote;
    if (fields.reflectionText !== undefined) values['reflectionText'] = fields.reflectionText;

    const [log] = (await this.using(tx).update(schema.questLogs, values, eq(schema.questLogs.id, questLogId)).returning()) as QuestLog.Row[];
    return log ?? null;
  }

  async remove(tx: DatabaseTransaction, questLogId: bigint): Promise<boolean> {
    const scope = this.using(tx);
    const deleted = await scope.delete(schema.questLogs, eq(schema.questLogs.id, questLogId)).returning({ id: schema.questLogs.id });
    if (deleted.length === 0) return false;
    await scope.tombstone('quest_logs', String(questLogId));
    return true;
  }

  findByIdForUpdate(tx: DatabaseTransaction, questLogId: bigint): Promise<QuestLog.Row | null> {
    const accountId = this.requireAccountId();
    return tx
      .select()
      .from(schema.questLogs)
      .where(and(eq(schema.questLogs.accountId, accountId), eq(schema.questLogs.id, questLogId)))
      .for('update')
      .then(rows => rows[0] ?? null);
  }

  /** Count of reschedules for this quest in the rolling 7-day window ending on `date` (inclusive), the PRD §2.2 cap's input. */
  async rescheduleCountInWindow(tx: DatabaseTransaction, questId: bigint, sinceDate: string): Promise<number> {
    const accountId = this.requireAccountId();
    const [row] = await tx
      .select({ count: sql<string>`count(*)` })
      .from(schema.rescheduleEvents)
      .where(and(eq(schema.rescheduleEvents.accountId, accountId), eq(schema.rescheduleEvents.questId, questId), gte(schema.rescheduleEvents.date, sinceDate)));
    return Number(row?.count ?? 0);
  }

  insertRescheduleEvent(
    tx: DatabaseTransaction,
    values: { questId: bigint; date: string; fromMin: number | null; toMin: number; reasonTag?: QuestLog.ReasonTag | null; reasonNote?: string | null },
  ): Promise<void> {
    const accountId = this.requireAccountId();
    return tx
      .insert(schema.rescheduleEvents)
      .values({
        accountId,
        questId: values.questId,
        date: values.date,
        fromMin: values.fromMin,
        toMin: values.toMin,
        reasonTag: values.reasonTag ?? null,
        reasonNote: values.reasonNote ?? null,
      })
      .then(() => undefined);
  }
}
