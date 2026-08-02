/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, asc, eq, type SQL } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Novel, type PrimaryDatabase, schema } from '@server/modules/datastore';

import { PublishAuditService } from './publish-audit.service';
import { type UnpublishResult, type UpsertResult } from './publish.service';
import { type PublishAuditEntry } from './publish.types';
import { type WikiEntryUpsertBody, type WikiManifestItem } from './wiki-ingest.dto';

/**
 * Defining types
 */

interface StaleMarker {
  outcome: 'stale';
  stored: number;
}

/**
 * Declaring the constants
 *
 * The wiki push obeys the same optimistic-concurrency ladder as the chapter push: a revision behind the
 * stored one is a 409 stale rejection, an equal revision carrying an identical content hash is a no-op, and
 * anything else replaces the entry and its whole set of facets and images in one transaction — the reader
 * diffs nothing, so a partial apply cannot leave a half-revealed entry. Every branch commits exactly one
 * audit row atomically with its decision.
 */

@Injectable()
export class WikiIngestService {
  private readonly logger = Logger.getLogger(APP_NAME, WikiIngestService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly auditService: PublishAuditService,
    private readonly context: ContextService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async upsertEntry(slug: string, entryKey: string, body: WikiEntryUpsertBody): Promise<UpsertResult> {
    const caller = this.caller();
    const novel = await this.getNovelBySlug(slug);
    const result = await this.db.transaction(async tx => {
      const [stored] = await tx.select().from(schema.wikiEntries).where(this.entryFilter(novel.id, entryKey)).for('update');
      const base: Omit<PublishAuditEntry, 'outcome'> = {
        action: 'wiki.upsert',
        novelSlug: slug,
        contentHash: body.contentHash,
        incomingRevision: body.revision,
        storedRevision: stored?.revision,
        ...caller,
      };

      if (stored && body.revision < stored.revision) {
        await this.auditService.record({ ...base, outcome: 'stale_rejected' }, tx);
        return { outcome: 'stale', stored: stored.revision } satisfies StaleMarker;
      }
      if (stored && body.revision === stored.revision && body.contentHash === stored.contentHash) {
        await this.auditService.record({ ...base, outcome: 'noop' }, tx);
        return { outcome: 'noop', revision: stored.revision } satisfies UpsertResult;
      }

      const values = {
        type: body.type,
        name: body.name,
        imageRef: body.imageRef ?? null,
        firstVisibleOrdinal: body.firstVisibleOrdinal,
        contentHash: body.contentHash,
        revision: body.revision,
        updatedAt: new Date(),
      };
      let entryId: bigint;
      if (stored) {
        await tx.update(schema.wikiEntries).set(values).where(eq(schema.wikiEntries.id, stored.id));
        entryId = stored.id;
        await tx.delete(schema.wikiEntryFacets).where(eq(schema.wikiEntryFacets.entryId, entryId));
        await tx.delete(schema.wikiEntryImages).where(eq(schema.wikiEntryImages.entryId, entryId));
      } else {
        const [inserted] = await tx
          .insert(schema.wikiEntries)
          .values({ novelId: novel.id, entryKey, ...values })
          .returning({ id: schema.wikiEntries.id });
        entryId = (inserted as { id: bigint }).id;
      }

      if (body.facets.length > 0) {
        await tx
          .insert(schema.wikiEntryFacets)
          .values(
            body.facets.map(facet => ({ entryId, facetKey: facet.facetKey, content: facet.content, sortOrder: facet.sortOrder, visibleFromOrdinal: facet.visibleFromOrdinal })),
          );
      }
      if (body.images.length > 0) {
        await tx.insert(schema.wikiEntryImages).values(
          body.images.map(image => ({
            entryId,
            imageRef: image.imageRef,
            caption: image.caption ?? null,
            sortOrder: image.sortOrder,
            visibleFromOrdinal: image.visibleFromOrdinal,
          })),
        );
      }
      await this.auditService.record({ ...base, outcome: 'applied' }, tx);
      return { outcome: 'applied', revision: body.revision } satisfies UpsertResult;
    });

    this.auditService.markRecorded();
    if (result.outcome === 'stale') throw AppErrorCode.WBN_003.create({ incoming: body.revision, stored: result.stored });
    this.logger.info('wiki entry push handled', { slug, entryKey, outcome: result.outcome, revision: body.revision });
    return result;
  }

  /** Delete is idempotent: removing an absent entry (or an unknown novel) is a recorded no-op. Cascades drop facets/images. */
  async deleteEntry(slug: string, entryKey: string): Promise<UnpublishResult> {
    const caller = this.caller();
    const base: Omit<PublishAuditEntry, 'outcome'> = { action: 'wiki.delete', novelSlug: slug, ...caller };

    const [novel] = await this.db.select().from(schema.novels).where(eq(schema.novels.slug, slug));
    if (!novel) {
      await this.auditService.record({ ...base, outcome: 'noop' });
      this.auditService.markRecorded();
      return { outcome: 'noop' };
    }

    const result = await this.db.transaction(async tx => {
      const deleted = await tx.delete(schema.wikiEntries).where(this.entryFilter(novel.id, entryKey)).returning();
      const removed = deleted[0];
      const outcome = removed ? 'applied' : 'noop';
      await this.auditService.record({ ...base, outcome, contentHash: removed?.contentHash, storedRevision: removed?.revision }, tx);
      return { outcome } satisfies UnpublishResult;
    });

    this.auditService.markRecorded();
    this.logger.info('wiki entry delete handled', { slug, entryKey, outcome: result.outcome });
    return result;
  }

  /** The reconciliation primitive: the forge diffs this against its wiki ledger. Reads are not audited. */
  async getManifest(slug: string): Promise<WikiManifestItem[]> {
    const novel = await this.getNovelBySlug(slug);
    return this.db
      .select({ entryKey: schema.wikiEntries.entryKey, revision: schema.wikiEntries.revision, contentHash: schema.wikiEntries.contentHash })
      .from(schema.wikiEntries)
      .where(eq(schema.wikiEntries.novelId, novel.id))
      .orderBy(asc(schema.wikiEntries.entryKey));
  }

  private async getNovelBySlug(slug: string): Promise<Novel> {
    const [novel] = await this.db.select().from(schema.novels).where(eq(schema.novels.slug, slug));
    return novel ?? AppErrorCode.WBN_001.throw();
  }

  private entryFilter(novelId: bigint, entryKey: string): SQL {
    return and(eq(schema.wikiEntries.novelId, novelId), eq(schema.wikiEntries.entryKey, entryKey)) as SQL;
  }

  private caller(): Pick<PublishAuditEntry, 'callerSub' | 'callerClientId'> {
    const principal = this.context.getAuthPrincipalOrNull();
    return { callerSub: principal?.sub, callerClientId: principal?.clientId };
  }
}
