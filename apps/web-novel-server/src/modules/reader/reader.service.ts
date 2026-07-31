/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { CatalogService } from '@server/modules/catalog';
import { type PrimaryDatabase, schema } from '@server/modules/datastore';

import { type LibraryItem, type ProgressBody, type ProgressListItem, type ProgressResponse } from './reader.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
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
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /*!
   * Reading progress
   */

  async listProgress(userId: string): Promise<ProgressListItem[]> {
    const rows = await this.db
      .select({ novelSlug: schema.novels.slug, ordinal: schema.readingProgress.ordinal, position: schema.readingProgress.position, updatedAt: schema.readingProgress.updatedAt })
      .from(schema.readingProgress)
      .innerJoin(schema.novels, eq(schema.readingProgress.novelId, schema.novels.id))
      .where(eq(schema.readingProgress.userId, userId))
      .orderBy(desc(schema.readingProgress.updatedAt));
    return rows.map(row => ({ novelSlug: row.novelSlug, ordinal: row.ordinal, position: row.position, updatedAt: row.updatedAt.toISOString() }));
  }

  async getProgress(userId: string, slug: string): Promise<ProgressResponse> {
    const novel = await this.catalogService.getNovelBySlug(slug);
    const [progress] = await this.db
      .select()
      .from(schema.readingProgress)
      .where(and(eq(schema.readingProgress.userId, userId), eq(schema.readingProgress.novelId, novel.id)));
    if (!progress) throw AppErrorCode.WBN_006.create();
    return { ordinal: progress.ordinal, position: progress.position, updatedAt: progress.updatedAt.toISOString() };
  }

  async saveProgress(userId: string, slug: string, body: ProgressBody): Promise<ProgressResponse> {
    const novel = await this.catalogService.getNovelBySlug(slug);
    const updatedAt = new Date();
    await this.db
      .insert(schema.readingProgress)
      .values({ userId, novelId: novel.id, ordinal: body.ordinal, position: body.position, updatedAt })
      .onConflictDoUpdate({ target: [schema.readingProgress.userId, schema.readingProgress.novelId], set: { ordinal: body.ordinal, position: body.position, updatedAt } });
    this.logger.debug('reading progress saved', { userId, slug, ordinal: body.ordinal });
    return { ordinal: body.ordinal, position: body.position, updatedAt: updatedAt.toISOString() };
  }

  /*!
   * Library
   */

  async listLibrary(userId: string): Promise<LibraryItem[]> {
    const rows = await this.db
      .select({ novel: schema.novels, addedAt: schema.library.addedAt })
      .from(schema.library)
      .innerJoin(schema.novels, eq(schema.library.novelId, schema.novels.id))
      .where(eq(schema.library.userId, userId))
      .orderBy(desc(schema.library.addedAt));
    return rows.map(row => ({
      slug: row.novel.slug,
      title: row.novel.title,
      coverPath: row.novel.coverPath ?? undefined,
      genres: row.novel.genres,
      status: row.novel.status,
      addedAt: row.addedAt.toISOString(),
    }));
  }

  /** Idempotent: re-adding an existing entry keeps the original addedAt */
  async addToLibrary(userId: string, slug: string): Promise<void> {
    const novel = await this.catalogService.getNovelBySlug(slug);
    await this.db.insert(schema.library).values({ userId, novelId: novel.id }).onConflictDoNothing();
    this.logger.debug('novel added to library', { userId, slug });
  }

  /** Idempotent: removing an absent entry (or an unknown slug) succeeds silently */
  async removeFromLibrary(userId: string, slug: string): Promise<void> {
    const [novel] = await this.db.select({ id: schema.novels.id }).from(schema.novels).where(eq(schema.novels.slug, slug));
    if (!novel) return;
    await this.db.delete(schema.library).where(and(eq(schema.library.userId, userId), eq(schema.library.novelId, novel.id)));
    this.logger.debug('novel removed from library', { userId, slug });
  }
}
