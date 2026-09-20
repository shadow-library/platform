/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type AppliedSuggestion, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class AppliedSuggestionRepository extends OwnerScopedRepository {
  /** Append-only; `ON CONFLICT DO NOTHING` on `(result_id, suggestion_index)` is the whole replay guard (§28.6 "apply records applied_suggestions exactly once"). */
  async insertIfAbsent(resultId: bigint, suggestionIndex: number, questId: bigint, questSnapshotBefore: unknown): Promise<AppliedSuggestion.Row | null> {
    const accountId = this.requireAccountId();
    const [row] = await this.db
      .insert(schema.appliedSuggestions)
      .values({ accountId, resultId, suggestionIndex, questId, questSnapshotBefore })
      .onConflictDoNothing({ target: [schema.appliedSuggestions.resultId, schema.appliedSuggestions.suggestionIndex] })
      .returning();
    return (row as AppliedSuggestion.Row) ?? null;
  }

  async findByResultAndIndex(resultId: bigint, suggestionIndex: number): Promise<AppliedSuggestion.Row | null> {
    const [row] = (await this.scoped(
      schema.appliedSuggestions,
      eq(schema.appliedSuggestions.resultId, resultId),
      eq(schema.appliedSuggestions.suggestionIndex, suggestionIndex),
    )) as AppliedSuggestion.Row[];
    return row ?? null;
  }
}
