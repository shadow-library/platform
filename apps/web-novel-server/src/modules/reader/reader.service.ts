import { and, desc, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { type AuthPrincipal } from '@shadow-library/auth';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { CatalogService, NovelAccessService } from '@server/modules/catalog';
import { type Novel, type PrimaryDatabase, schema } from '@server/modules/datastore';

import { type LibraryItem, type ProgressBody, type ProgressListItem, type ProgressResponse } from './reader.dto';

/**
 * Audience data: originates here, stays here — never crosses back to the forge. `userId` is the
 * identity subject; there is deliberately no local account row to attach it to.
 */

@Injectable()
export class ReaderService {
  private readonly logger = Logger.getLogger(APP_NAME, ReaderService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly catalogService: CatalogService,
    private readonly accessService: NovelAccessService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async listProgress(principal: AuthPrincipal): Promise<ProgressListItem[]> {
    const rows = await this.db
      .select({
        novel: { id: schema.novels.id, visibility: schema.novels.visibility, organisationId: schema.novels.organisationId },
        novelSlug: schema.novels.slug,
        ordinal: schema.readingProgress.ordinal,
        position: schema.readingProgress.position,
        furthestOrdinal: schema.readingProgress.furthestOrdinal,
        updatedAt: schema.readingProgress.updatedAt,
      })
      .from(schema.readingProgress)
      .innerJoin(schema.novels, eq(schema.readingProgress.novelId, schema.novels.id))
      .where(eq(schema.readingProgress.userId, principal.sub))
      .orderBy(desc(schema.readingProgress.updatedAt));

    const readable = await this.accessService.readableIds(
      rows.map(row => row.novel),
      principal,
    );
    return rows
      .filter(row => readable.has(row.novel.id))
      .map(row => ({ novelSlug: row.novelSlug, ordinal: row.ordinal, position: row.position, furthestOrdinal: row.furthestOrdinal, updatedAt: row.updatedAt.toISOString() }));
  }

  async getProgress(principal: AuthPrincipal, slug: string): Promise<ProgressResponse> {
    const novel = await this.catalogService.getReadableNovel(slug, principal);
    const userId = principal.sub;
    const [progress] = await this.db
      .select()
      .from(schema.readingProgress)
      .where(and(eq(schema.readingProgress.userId, userId), eq(schema.readingProgress.novelId, novel.id)));
    if (!progress) throw AppErrorCode.WBN_006.create();
    return { ordinal: progress.ordinal, position: progress.position, furthestOrdinal: progress.furthestOrdinal, updatedAt: progress.updatedAt.toISOString() };
  }

  /**
   * `furthestOrdinal` is monotonic: a fresh row initializes it to the saved ordinal, and an upsert takes
   * `GREATEST` of the stored value and the new ordinal so rereading an earlier chapter never lowers it.
   */
  async saveProgress(principal: AuthPrincipal, slug: string, body: ProgressBody): Promise<ProgressResponse> {
    const novel = await this.catalogService.getReadableNovel(slug, principal);
    const userId = principal.sub;
    const updatedAt = new Date();
    const [progress] = await this.db
      .insert(schema.readingProgress)
      .values({ userId, novelId: novel.id, ordinal: body.ordinal, position: body.position, furthestOrdinal: body.ordinal, updatedAt })
      .onConflictDoUpdate({
        target: [schema.readingProgress.userId, schema.readingProgress.novelId],
        set: { ordinal: body.ordinal, position: body.position, furthestOrdinal: sql`greatest(${schema.readingProgress.furthestOrdinal}, ${body.ordinal})`, updatedAt },
      })
      .returning();
    if (!progress) throw AppError.internal(`upsert of reading progress returned no row for user ${userId}, novel ${novel.id}`);
    this.logger.debug('reading progress saved', { userId, slug, ordinal: body.ordinal, furthestOrdinal: progress.furthestOrdinal });
    return { ordinal: progress.ordinal, position: progress.position, furthestOrdinal: progress.furthestOrdinal, updatedAt: updatedAt.toISOString() };
  }

  async listLibrary(principal: AuthPrincipal): Promise<LibraryItem[]> {
    const rows = await this.db
      .select({ novel: schema.novels, addedAt: schema.library.addedAt })
      .from(schema.library)
      .innerJoin(schema.novels, eq(schema.library.novelId, schema.novels.id))
      .where(eq(schema.library.userId, principal.sub))
      .orderBy(desc(schema.library.addedAt));

    const readable = await this.accessService.readableIds(
      rows.map(row => row.novel),
      principal,
    );
    return rows.filter(row => readable.has(row.novel.id)).map(row => this.toLibraryItem(row.novel, row.addedAt));
  }

  /**
   * The shelf of novels shared *with* this reader — the only place a non-public novel is ever
   * listed. Two queries rather than one because the two tiers are answered by different authorities:
   * a restricted grant is a row in this database, whereas organisation membership is identity's to
   * say, and no join can express it.
   */
  async listShared(principal: AuthPrincipal): Promise<LibraryItem[]> {
    const granted = await this.db
      .select({ novel: schema.novels })
      .from(schema.novelGrants)
      .innerJoin(schema.novels, eq(schema.novelGrants.novelId, schema.novels.id))
      .where(and(eq(schema.novelGrants.subjectId, principal.sub), eq(schema.novels.visibility, 'RESTRICTED')));

    const orgShared = await this.db.select({ novel: schema.novels }).from(schema.novels).where(eq(schema.novels.visibility, 'ORGANISATION'));

    const candidates = [...granted, ...orgShared].map(row => row.novel);
    const readable = await this.accessService.readableIds(candidates, principal);
    return candidates
      .filter(novel => readable.has(novel.id))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(novel => this.toLibraryItem(novel, novel.updatedAt));
  }

  private toLibraryItem(novel: Novel, addedAt: Date): LibraryItem {
    return {
      slug: novel.slug,
      title: novel.title,
      coverUrl: this.catalogService.imageUrl(novel.coverPath),
      genres: novel.genres,
      status: novel.status,
      visibility: novel.visibility,
      addedAt: addedAt.toISOString(),
    };
  }

  async addToLibrary(principal: AuthPrincipal, slug: string): Promise<void> {
    const novel = await this.catalogService.getReadableNovel(slug, principal);
    await this.db.insert(schema.library).values({ userId: principal.sub, novelId: novel.id }).onConflictDoNothing();
    this.logger.debug('novel added to library', { userId: principal.sub, slug });
  }

  async removeFromLibrary(userId: string, slug: string): Promise<void> {
    const [novel] = await this.db.select({ id: schema.novels.id }).from(schema.novels).where(eq(schema.novels.slug, slug));
    if (!novel) return;
    await this.db.delete(schema.library).where(and(eq(schema.library.userId, userId), eq(schema.library.novelId, novel.id)));
    this.logger.debug('novel removed from library', { userId, slug });
  }
}
