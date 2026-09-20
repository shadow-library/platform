/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type DatabaseTransaction, type Meal, type MealPreset, schema } from '@server/database';

/**
 * Defining types
 */

export interface MealPresetDraft {
  name: string;
  calories: number;
  mealType: Meal.MealType;
  note: string | null;
}

/**
 * Declaring the constants
 */

@Injectable()
export class MealPresetRepository extends OwnerScopedRepository {
  async list(): Promise<MealPreset.Row[]> {
    return (await this.scoped(schema.mealPresets)) as MealPreset.Row[];
  }

  async findByIdInTx(tx: DatabaseTransaction, id: bigint): Promise<MealPreset.Row | null> {
    const accountId = this.requireAccountId();
    const rows = await tx
      .select()
      .from(schema.mealPresets)
      .where(eq(schema.mealPresets.accountId, accountId))
      .then(all => all.filter(row => row.id === id));
    return rows[0] ?? null;
  }

  async create(tx: DatabaseTransaction, draft: MealPresetDraft): Promise<MealPreset.Row> {
    const accountId = this.requireAccountId();
    const [preset] = await tx.insert(schema.mealPresets).values({ accountId, name: draft.name, calories: draft.calories, mealType: draft.mealType, note: draft.note }).returning();
    if (!preset) throw AppError.internal('meal preset insert returned no row');
    return preset;
  }

  async update(tx: DatabaseTransaction, id: bigint, patch: Partial<MealPresetDraft>): Promise<MealPreset.Row | null> {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) values['name'] = patch.name;
    if (patch.calories !== undefined) values['calories'] = patch.calories;
    if (patch.mealType !== undefined) values['mealType'] = patch.mealType;
    if (patch.note !== undefined) values['note'] = patch.note;

    const [preset] = (await this.using(tx).update(schema.mealPresets, values, eq(schema.mealPresets.id, id)).returning()) as MealPreset.Row[];
    return preset ?? null;
  }

  async remove(tx: DatabaseTransaction, id: bigint): Promise<MealPreset.Row | null> {
    const [preset] = (await this.using(tx).delete(schema.mealPresets, eq(schema.mealPresets.id, id)).returning()) as MealPreset.Row[];
    return preset ?? null;
  }
}
