/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type DatabaseTransaction, type Quest, schema } from '@server/database';

import { type QuestDraftInput } from './quest-command.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class QuestRepository extends OwnerScopedRepository {
  async findById(questId: bigint): Promise<Quest.Row | null> {
    const rows = (await this.scoped(schema.quests, eq(schema.quests.id, questId))) as Quest.Row[];
    return rows[0] ?? null;
  }

  async listActive(): Promise<Quest.Row[]> {
    return (await this.scoped(schema.quests, eq(schema.quests.active, true))) as Quest.Row[];
  }

  async create(tx: DatabaseTransaction, draft: QuestDraftInput): Promise<Quest.Row> {
    const accountId = this.requireAccountId();
    const [quest] = await tx
      .insert(schema.quests)
      .values({
        accountId,
        name: draft.name,
        notes: draft.notes,
        startTimeMin: draft.startTimeMinutes,
        durationMin: draft.durationMinutes,
        statAffinity: draft.statAffinity,
        strictness: draft.strictness,
        optionalStreakOptIn: draft.optionalStreakOptIn,
        recurrence: draft.recurrence,
        moduleLink: draft.moduleLink,
        reminderEnabled: draft.reminderEnabled,
        reminderLeadMin: draft.reminderLeadMin,
        healthThreshold: draft.healthThreshold,
        active: draft.active,
      })
      .returning();
    if (!quest) throw AppError.internal('quest insert returned no row');
    return quest;
  }

  /** Future-only per PRD §2.2: the patch never rewrites a past `quest_logs` snapshot — those carry their own `strictness`/`statAffinity` at log time. */
  async update(tx: DatabaseTransaction, questId: bigint, patch: Partial<QuestDraftInput>): Promise<Quest.Row | null> {
    const values: Record<string, unknown> = {};
    if (patch.name !== undefined) values['name'] = patch.name;
    if (patch.notes !== undefined) values['notes'] = patch.notes;
    if (patch.startTimeMinutes !== undefined) values['startTimeMin'] = patch.startTimeMinutes;
    if (patch.durationMinutes !== undefined) values['durationMin'] = patch.durationMinutes;
    if (patch.statAffinity !== undefined) values['statAffinity'] = patch.statAffinity;
    if (patch.strictness !== undefined) values['strictness'] = patch.strictness;
    if (patch.optionalStreakOptIn !== undefined) values['optionalStreakOptIn'] = patch.optionalStreakOptIn;
    if (patch.recurrence !== undefined) values['recurrence'] = patch.recurrence;
    if (patch.moduleLink !== undefined) values['moduleLink'] = patch.moduleLink;
    if (patch.reminderEnabled !== undefined) values['reminderEnabled'] = patch.reminderEnabled;
    if (patch.reminderLeadMin !== undefined) values['reminderLeadMin'] = patch.reminderLeadMin;
    if (patch.healthThreshold !== undefined) values['healthThreshold'] = patch.healthThreshold;
    if (patch.active !== undefined) values['active'] = patch.active;
    values['updatedAt'] = new Date();

    const [quest] = (await this.using(tx).update(schema.quests, values, eq(schema.quests.id, questId)).returning()) as Quest.Row[];
    return quest ?? null;
  }

  /** Deletion is soft — deactivation only (PRD §2.2); historical `quest_logs` rows keep referencing the quest. */
  async softDelete(tx: DatabaseTransaction, questId: bigint): Promise<Quest.Row | null> {
    const [quest] = (await this.using(tx).update(schema.quests, { active: false, updatedAt: new Date() }, eq(schema.quests.id, questId)).returning()) as Quest.Row[];
    return quest ?? null;
  }

  findByIdForUpdate(tx: DatabaseTransaction, questId: bigint): Promise<Quest.Row | null> {
    const accountId = this.requireAccountId();
    return tx
      .select()
      .from(schema.quests)
      .where(and(eq(schema.quests.accountId, accountId), eq(schema.quests.id, questId)))
      .for('update')
      .then(rows => rows[0] ?? null);
  }
}
