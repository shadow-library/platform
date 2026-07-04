/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';
import { and, countDistinct, desc, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

export interface ConsolidateResult {
  significanceUpdated: number;
  relationshipsPromoted: number;
}

/**
 * Declaring the constants
 */

/**
 * An entity is promoted to "major" significance once it appears in this many
 * distinct chapters. Below the threshold it remains "minor".
 */
const SIGNIFICANCE_MIN_CHAPTERS = 3;

/**
 * A relationship observation is promoted to a canonical entity_relationship
 * once the same (entityId, targetKey, kind) triple is observed in this many
 * distinct chapters.
 */
const RELATIONSHIP_MIN_CHAPTERS = 3;

/**
 * Deterministic, LLM-free consolidation pass.
 *
 * Two operations:
 *  1. Significance recalculation — count distinct appearance chapters per
 *     entity and flip significance between "major" / "minor".
 *  2. Relationship promotion — move observations that exceed the threshold
 *     into the canonical entity_relationships table.
 */
@Injectable()
export class ConsolidateService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async consolidate(projectId: bigint): Promise<ConsolidateResult> {
    const [significanceUpdated, relationshipsPromoted] = await Promise.all([this.recalculateSignificance(projectId), this.promoteRelationships(projectId)]);

    return { significanceUpdated, relationshipsPromoted };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async recalculateSignificance(projectId: bigint): Promise<number> {
    const rows = await this.db
      .select({ entityId: schema.entityAppearances.entityId, count: countDistinct(schema.entityAppearances.chapter) })
      .from(schema.entityAppearances)
      .where(eq(schema.entityAppearances.projectId, projectId))
      .groupBy(schema.entityAppearances.entityId);

    let updated = 0;
    for (const row of rows) {
      const significance = row.count >= SIGNIFICANCE_MIN_CHAPTERS ? 'major' : 'minor';
      await this.db.update(schema.entities).set({ significance, updatedAt: new Date() }).where(eq(schema.entities.id, row.entityId));
      updated++;
    }

    return updated;
  }

  private async promoteRelationships(projectId: bigint): Promise<number> {
    const rows = await this.db
      .select({
        entityId: schema.relationshipObservations.entityId,
        targetKey: schema.relationshipObservations.targetKey,
        kind: schema.relationshipObservations.kind,
        count: countDistinct(schema.relationshipObservations.chapter),
      })
      .from(schema.relationshipObservations)
      .where(eq(schema.relationshipObservations.projectId, projectId))
      .groupBy(schema.relationshipObservations.entityId, schema.relationshipObservations.targetKey, schema.relationshipObservations.kind);

    let promoted = 0;
    for (const row of rows) {
      if (row.count < RELATIONSHIP_MIN_CHAPTERS) continue;

      // Use the most recent observation's note and chapter for the canonical record.
      const latest = await this.db.query.relationshipObservations.findFirst({
        where: and(
          eq(schema.relationshipObservations.entityId, row.entityId),
          eq(schema.relationshipObservations.targetKey, row.targetKey),
          eq(schema.relationshipObservations.kind, row.kind),
        ),
        orderBy: [desc(schema.relationshipObservations.chapter)],
      });

      await this.db
        .insert(schema.entityRelationships)
        .values({ projectId, entityId: row.entityId, targetKey: row.targetKey, kind: row.kind, note: latest?.note ?? null, chapter: latest?.chapter ?? null })
        .onConflictDoNothing();

      promoted++;
    }

    return promoted;
  }
}
