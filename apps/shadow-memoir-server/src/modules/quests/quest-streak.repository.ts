/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { EMPTY_STREAK_STATE, type StreakState } from '@modules/rules';
import { type DatabaseTransaction, schema, syncStamped } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class QuestStreakRepository extends OwnerScopedRepository {
  async readForUpdate(tx: DatabaseTransaction, questId: bigint): Promise<StreakState> {
    const accountId = this.requireAccountId();
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
      pendingShieldGrant: row.pendingShieldGrant,
    };
  }

  /** Unifies the command path's streak break with rollover's miss path (T-19's gap): both must record the same audit row when a shield bridges. */
  async insertShieldConsumption(tx: DatabaseTransaction, questId: bigint, date: string): Promise<void> {
    const accountId = this.requireAccountId();
    await tx
      .insert(schema.shieldConsumptions)
      .values({ accountId, questId, date })
      .onConflictDoNothing({ target: [schema.shieldConsumptions.accountId, schema.shieldConsumptions.questId, schema.shieldConsumptions.date] });
  }

  /**
   * `run_start_date` only moves forward on a fresh run (`currentDays` reaching 1 from 0); every other
   * transition — continuing a hold, bridging a shielded break, or resetting to zero — leaves it alone or
   * clears it, never rewriting an in-progress run's start.
   */
  async write(tx: DatabaseTransaction, questId: bigint, date: string, state: StreakState): Promise<void> {
    const accountId = this.requireAccountId();
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
        pendingShieldGrant: state.pendingShieldGrant,
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
          pendingShieldGrant: state.pendingShieldGrant,
          ...(runStartDate === undefined ? {} : { runStartDate }),
          lastCountedDate: date,
        }),
      });
  }
}
