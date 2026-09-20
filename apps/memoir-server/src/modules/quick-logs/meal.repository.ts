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
import { type DatabaseTransaction, type Meal, schema } from '@server/database';

/**
 * Defining types
 */

export interface MealDraft {
  id: string;
  date: string;
  name: string;
  calories: number;
  mealType: Meal.MealType;
  note: string | null;
  presetId: bigint | null;
}

/**
 * Declaring the constants
 */

@Injectable()
export class MealRepository extends OwnerScopedRepository {
  async create(tx: DatabaseTransaction, draft: MealDraft, rewarded: boolean): Promise<Meal.Row> {
    const accountId = this.requireAccountId();
    const [meal] = await tx
      .insert(schema.meals)
      .values({
        id: draft.id,
        accountId,
        date: draft.date,
        name: draft.name,
        calories: draft.calories,
        mealType: draft.mealType,
        note: draft.note,
        presetId: draft.presetId,
        rewarded,
      })
      .returning();
    if (!meal) throw AppError.internal('meal insert returned no row');
    return meal;
  }

  /** Count of meals in `[from, to]` (inclusive, ISO dates) — the PRD §4.13 monthly cap's input. */
  async countInRange(tx: DatabaseTransaction, from: string, to: string): Promise<number> {
    const accountId = this.requireAccountId();
    const [row] = await tx
      .select({ count: sql<string>`count(*)` })
      .from(schema.meals)
      .where(and(eq(schema.meals.accountId, accountId), gte(schema.meals.date, from), lte(schema.meals.date, to)));
    return Number(row?.count ?? 0);
  }
}
