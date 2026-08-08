import { asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Publishing, schema } from '@server/database';

import { buildWikiProjections, type WikiEntryProjection } from './wiki-projection';

/**
 * Loads the domain data a wiki projection needs and keeps the `wiki_publications` ledger in step with it.
 * Projection is pure (`wiki-projection.ts`); this service is the impure edge — it reads entities, facts, and
 * the published-chapter ordinal map from Postgres, and reconciles the outbox ledger (insert new, bump-and-repend
 * changed, tombstone vanished) so the runner has only to walk rows and push. The reader push itself lives in the
 * runner, which owns the reader client (mirrors how `PublishingService` prepares chapter rows for `PublishRunner`).
 */
@Injectable()
export class WikiPublishingService {
  private readonly logger = Logger.getLogger(APP_NAME, WikiPublishingService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Recomputes every entity's spoiler-gated wiki payload from the current bible, ledger, and published ordinals. */
  async computeProjections(projectId: bigint): Promise<WikiEntryProjection[]> {
    const entities = await this.db.query.entities.findMany({
      where: eq(schema.entities.projectId, projectId),
      with: {
        aliases: true,
        images: { orderBy: (image, { asc: ascOrder }) => [ascOrder(image.sortOrder), ascOrder(image.id)] },
        relationships: true,
      },
    });
    const facts = await this.db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), with: { knowledge: true } });
    const chapterLedger = await this.db.query.chapterPublications.findMany({ where: eq(schema.chapterPublications.projectId, projectId) });

    // Only chapters live on the reader carry a usable ordinal: a fragment gated on a not-yet-published chapter
    // must stay withheld and reappear on the converge that follows that chapter going live.
    const ordinalByChapter = new Map<number, number>();
    for (const row of chapterLedger) if (row.status === 'published') ordinalByChapter.set(row.chapter, row.publishedOrdinal);

    return buildWikiProjections({
      entities: entities.map(entity => ({
        entityKey: entity.entityKey,
        type: entity.type,
        name: entity.name,
        body: entity.body,
        motivation: entity.motivation,
        attributes: entity.attributes,
        firstSeenChapter: entity.firstSeenChapter,
        imageRef: entity.imagePath,
        wikiVisibility: entity.wikiVisibility,
        aliases: entity.aliases.map(alias => alias.alias),
        images: entity.images.map(image => ({ imageRef: image.imagePath, caption: image.caption, sortOrder: image.sortOrder })),
        relationships: entity.relationships.map(relationship => ({
          targetKey: relationship.targetKey,
          kind: relationship.kind,
          note: relationship.note,
          chapter: relationship.chapter,
        })),
      })),
      facts: facts.map(fact => ({ factKey: fact.factKey, text: fact.text, subjects: fact.subjects ?? [], learnedInChapters: fact.knowledge.map(row => row.learnedInChapter) })),
      ordinalByChapter,
    });
  }

  loadLedger(projectId: bigint): Promise<Publishing.WikiPublication[]> {
    return this.db.query.wikiPublications.findMany({ where: eq(schema.wikiPublications.projectId, projectId), orderBy: asc(schema.wikiPublications.entryKey) });
  }

  /**
   * Diffs freshly computed projections against the ledger and writes the outbox rows the runner then pushes:
   * a new entry is inserted `pending`; a changed (or resurrected) entry bumps `revision`, re-stamps its hash,
   * and re-pends; an entry that no longer projects (hidden, deleted, or fallen to zero facets) becomes a
   * `deleted` tombstone the runner DELETEs from the reader. An unchanged entry is left exactly as it is — so a
   * converged wiki never churns a revision. Returns the reconciled ledger in reader order.
   */
  async reconcileLedger(projectId: bigint, projections: WikiEntryProjection[]): Promise<Publishing.WikiPublication[]> {
    const existing = await this.loadLedger(projectId);
    const byKey = new Map(existing.map(row => [row.entryKey, row]));
    const projectedKeys = new Set(projections.map(projection => projection.entryKey));
    const now = new Date();

    for (const projection of projections) {
      const row = byKey.get(projection.entryKey);
      if (!row) {
        await this.db.insert(schema.wikiPublications).values({ projectId, entryKey: projection.entryKey, revision: 1, contentHash: projection.contentHash, state: 'pending' });
        continue;
      }
      const resurrected = row.state === 'deleted';
      if (!resurrected && row.contentHash === projection.contentHash) continue;
      await this.db
        .update(schema.wikiPublications)
        .set({ contentHash: projection.contentHash, revision: row.revision + 1, state: 'pending', error: null, attempts: 0, updatedAt: now })
        .where(eq(schema.wikiPublications.id, row.id));
    }

    for (const row of existing) {
      if (projectedKeys.has(row.entryKey) || row.state === 'deleted') continue;
      await this.db.update(schema.wikiPublications).set({ state: 'deleted', error: null, updatedAt: now }).where(eq(schema.wikiPublications.id, row.id));
      this.logger.info('wiki entry withdrawn from projection', { projectId, entryKey: row.entryKey });
    }

    return this.loadLedger(projectId);
  }
}
