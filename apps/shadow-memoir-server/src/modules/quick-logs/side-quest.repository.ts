/**
 * Importing npm packages
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type DatabaseTransaction, type Quest, schema, type SideQuest } from '@server/database';

/**
 * Defining types
 */

export interface SideQuestDraft {
  id: string;
  date: string;
  name: string;
  statAffinity: Quest.StatAffinity | null;
}

/**
 * Declaring the constants
 */

@Injectable()
export class SideQuestRepository extends OwnerScopedRepository {
  async create(tx: DatabaseTransaction, draft: SideQuestDraft, reward: { xpAwarded: number; coinsAwarded: number; statTicked: number; rewarded: boolean }): Promise<SideQuest.Row> {
    const accountId = this.requireAccountId();
    const [entry] = await tx
      .insert(schema.sideQuests)
      .values({
        id: draft.id,
        accountId,
        date: draft.date,
        name: draft.name,
        statAffinity: draft.statAffinity,
        xpAwarded: reward.xpAwarded,
        coinsAwarded: reward.coinsAwarded,
        statTicked: reward.statTicked,
        rewarded: reward.rewarded,
      })
      .returning();
    if (!entry) throw AppError.internal('side quest insert returned no row');
    return entry;
  }

  /** Count of already-rewarded side quests on `date` — the PRD §4.12 first-3-per-day input, read `FOR UPDATE` so a serialized command sequence sees a consistent ordinal. */
  async countRewardedOn(tx: DatabaseTransaction, date: string): Promise<number> {
    const accountId = this.requireAccountId();
    const rows = await tx
      .select({ id: schema.sideQuests.id })
      .from(schema.sideQuests)
      .where(and(eq(schema.sideQuests.accountId, accountId), eq(schema.sideQuests.date, date), eq(schema.sideQuests.rewarded, true)))
      .for('update');
    return rows.length;
  }

  /** Count of side quests logged in `[from, to]` (inclusive, ISO dates) — the PRD §4.13 monthly cap's input. */
  async countInRange(tx: DatabaseTransaction, from: string, to: string): Promise<number> {
    const accountId = this.requireAccountId();
    const [row] = await tx
      .select({ count: sql<string>`count(*)` })
      .from(schema.sideQuests)
      .where(and(eq(schema.sideQuests.accountId, accountId), gte(schema.sideQuests.date, from), lte(schema.sideQuests.date, to)));
    return Number(row?.count ?? 0);
  }
}
