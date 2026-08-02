/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { and, asc, count, eq, gt, lte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { type AuthPrincipal } from '@shadow-library/auth';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { CatalogService } from '@server/modules/catalog';
import { type Novel, type PrimaryDatabase, schema } from '@server/modules/datastore';

import { type WikiEntryDetailResponse, type WikiListResponse } from './wiki.dto';

/**
 * Defining types
 */

/**
 * What the controller needs to answer a wiki read: the serialized body, plus the tier and whether the
 * response is reader-specific (so it can pick a caching story) and a gate-aware ETag for revalidation.
 */
export interface WikiRead<T> {
  body: T;
  etag: string;
  visibility: Novel['visibility'];
  personalized: boolean;
}

/**
 * Declaring the constants
 *
 * The gate is the reader's furthest-reached ordinal, or 0 for an anonymous reader or one with no progress —
 * entries and facets at ordinal 0 are the pre-reading public view. Everything gated is filtered in SQL by
 * `<= gate`, so nothing beyond the reader's progress is ever loaded, let alone serialized. A missing entry
 * and one lying beyond the gate are answered identically (WBN_009) so existence cannot be probed.
 */

@Injectable()
export class WikiService {
  private readonly logger = Logger.getLogger(APP_NAME, WikiService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly catalogService: CatalogService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async listEntries(slug: string, principal: AuthPrincipal | null): Promise<WikiRead<WikiListResponse>> {
    const novel = await this.catalogService.getReadableNovel(slug, principal);
    const gate = await this.resolveGate(novel.id, principal);

    const entries = await this.db
      .select({ entryKey: schema.wikiEntries.entryKey, type: schema.wikiEntries.type, name: schema.wikiEntries.name, imageRef: schema.wikiEntries.imageRef })
      .from(schema.wikiEntries)
      .where(and(eq(schema.wikiEntries.novelId, novel.id), lte(schema.wikiEntries.firstVisibleOrdinal, gate)))
      .orderBy(asc(schema.wikiEntries.name));

    const [stats] = await this.db
      .select({
        locked: sql<number>`count(*) filter (where ${schema.wikiEntries.firstVisibleOrdinal} > ${gate})::int`,
        maxRevision: sql<number>`coalesce(max(${schema.wikiEntries.revision}), 0)::int`,
      })
      .from(schema.wikiEntries)
      .where(eq(schema.wikiEntries.novelId, novel.id));

    const items = entries.map(entry => ({
      entryKey: entry.entryKey,
      type: entry.type as WikiListResponse['items'][number]['type'],
      name: entry.name,
      imageUrl: this.catalogService.imageUrl(entry.imageRef),
    }));
    const body: WikiListResponse = { items, lockedCount: stats?.locked ?? 0 };
    return { body, etag: this.etag(novel.accessRevision, stats?.maxRevision ?? 0, gate), visibility: novel.visibility, personalized: this.isPersonalized(principal) };
  }

  async getEntry(slug: string, entryKey: string, principal: AuthPrincipal | null): Promise<WikiRead<WikiEntryDetailResponse>> {
    const novel = await this.catalogService.getReadableNovel(slug, principal);
    const gate = await this.resolveGate(novel.id, principal);

    const [entry] = await this.db
      .select()
      .from(schema.wikiEntries)
      .where(and(eq(schema.wikiEntries.novelId, novel.id), eq(schema.wikiEntries.entryKey, entryKey), lte(schema.wikiEntries.firstVisibleOrdinal, gate)));
    if (!entry) throw AppErrorCode.WBN_009.create();

    const facets = await this.db
      .select({ facetKey: schema.wikiEntryFacets.facetKey, content: schema.wikiEntryFacets.content, sortOrder: schema.wikiEntryFacets.sortOrder })
      .from(schema.wikiEntryFacets)
      .where(and(eq(schema.wikiEntryFacets.entryId, entry.id), lte(schema.wikiEntryFacets.visibleFromOrdinal, gate)))
      .orderBy(asc(schema.wikiEntryFacets.sortOrder));

    const [hidden] = await this.db
      .select({ value: count() })
      .from(schema.wikiEntryFacets)
      .where(and(eq(schema.wikiEntryFacets.entryId, entry.id), gt(schema.wikiEntryFacets.visibleFromOrdinal, gate)));

    const images = await this.db
      .select({ imageRef: schema.wikiEntryImages.imageRef, caption: schema.wikiEntryImages.caption, sortOrder: schema.wikiEntryImages.sortOrder })
      .from(schema.wikiEntryImages)
      .where(and(eq(schema.wikiEntryImages.entryId, entry.id), lte(schema.wikiEntryImages.visibleFromOrdinal, gate)))
      .orderBy(asc(schema.wikiEntryImages.sortOrder));

    const body: WikiEntryDetailResponse = {
      entryKey: entry.entryKey,
      type: entry.type as WikiEntryDetailResponse['type'],
      name: entry.name,
      imageUrl: this.catalogService.imageUrl(entry.imageRef),
      facets: facets.map(facet => ({ facetKey: facet.facetKey, content: facet.content, sortOrder: facet.sortOrder })),
      images: images.map(image => ({ imageUrl: this.catalogService.imageUrl(image.imageRef) as string, caption: image.caption ?? undefined, sortOrder: image.sortOrder })),
      hiddenFacetCount: hidden?.value ?? 0,
    };
    return { body, etag: this.etag(novel.accessRevision, entry.revision, gate), visibility: novel.visibility, personalized: this.isPersonalized(principal) };
  }

  /** Anonymous readers and those with no progress row gate at 0 — the pre-reading public view. */
  private async resolveGate(novelId: bigint, principal: AuthPrincipal | null): Promise<number> {
    if (!this.isPersonalized(principal)) return 0;
    const sub = (principal as AuthPrincipal).sub;
    const [row] = await this.db
      .select({ furthest: schema.readingProgress.furthestOrdinal })
      .from(schema.readingProgress)
      .where(and(eq(schema.readingProgress.userId, sub), eq(schema.readingProgress.novelId, novelId)));
    return row?.furthest ?? 0;
  }

  private isPersonalized(principal: AuthPrincipal | null): boolean {
    return !!principal && principal.kind === 'user';
  }

  /**
   * A revalidation tag that changes whenever the answer could: the novel's access revision (a re-share can
   * flip visibility), the relevant wiki revision (any content change bumps it), and the gate (progress moves
   * the reveal line). Two of the three are reader-independent, so anonymous readers share cache entries.
   */
  private etag(accessRevision: number, revision: number, gate: number): string {
    return `"${createHash('sha1').update(`${accessRevision}:${revision}:${gate}`).digest('hex')}"`;
  }
}
