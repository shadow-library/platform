import { and, countDistinct, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase, schema } from '@server/database';

export interface ConsolidateResult {
  significanceUpdated: number;
  relationshipsPromoted: number;
}

const SIGNIFICANCE_MIN_CHAPTERS = 3;

const RELATIONSHIP_MIN_CHAPTERS = 3;

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
