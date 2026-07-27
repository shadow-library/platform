/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, asc, count, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, LRUCache } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Novel, type PrimaryDatabase, schema } from '@server/modules/datastore';

import { type ChapterContentResponse, type ChapterMetaItem, type NovelCatalogQuery, type NovelCatalogResponse, type NovelDetailResponse, type NovelSummary } from './catalog.dto';

/**
 * Defining types
 */

export interface ChapterRef {
  novelSlug: string;
  chapterId: bigint;
  ordinal: number;
  contentHash: string;
  revision: number;
}

/**
 * Declaring the constants
 *
 * Chapter payloads are cached under a key that includes the forge-assigned revision, so a
 * republish (revision bump) is a natural cache miss and stale entries simply age out of the LRU —
 * no explicit invalidation path exists or is needed.
 */
const CHAPTER_CACHE_CAPACITY = 512;

@Injectable()
export class CatalogService {
  private readonly logger = Logger.getLogger(APP_NAME, CatalogService.name);
  private readonly chapterCache = new LRUCache(CHAPTER_CACHE_CAPACITY);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async listNovels(query: NovelCatalogQuery): Promise<NovelCatalogResponse> {
    const filters = this.buildFilters(query);
    /** Written raw and fully qualified: drizzle renders embedded columns unqualified inside sql`` fragments, silently mis-correlating the subquery */
    const chapterCount = sql<number>`(SELECT COUNT(*)::int FROM published_chapters WHERE published_chapters.novel_id = novels.id)`;

    const [total] = await this.db.select({ value: count() }).from(schema.novels).where(filters);
    const rows = await this.db
      .select({ novel: schema.novels, chapterCount })
      .from(schema.novels)
      .where(filters)
      .orderBy(this.buildOrder(query))
      .limit(query.limit)
      .offset(query.offset);

    const items = rows.map(row => this.toSummary(row.novel, row.chapterCount));
    return { total: total?.value ?? 0, limit: query.limit, offset: query.offset, items };
  }

  async getNovel(slug: string): Promise<NovelDetailResponse> {
    const novel = await this.getNovelBySlug(slug);
    const [chapters] = await this.db.select({ value: count() }).from(schema.publishedChapters).where(eq(schema.publishedChapters.novelId, novel.id));
    return { ...this.toSummary(novel, chapters?.value ?? 0), createdAt: novel.createdAt.toISOString() };
  }

  async listChapters(slug: string): Promise<ChapterMetaItem[]> {
    const novel = await this.getNovelBySlug(slug);
    const chapters = await this.db
      .select({
        ordinal: schema.publishedChapters.ordinal,
        title: schema.publishedChapters.title,
        wordCount: schema.publishedChapters.wordCount,
        publishedAt: schema.publishedChapters.publishedAt,
      })
      .from(schema.publishedChapters)
      .where(eq(schema.publishedChapters.novelId, novel.id))
      .orderBy(asc(schema.publishedChapters.ordinal));

    return chapters.map(chapter => ({
      ordinal: chapter.ordinal,
      title: chapter.title,
      wordCount: chapter.wordCount ?? undefined,
      publishedAt: chapter.publishedAt?.toISOString(),
    }));
  }

  /** Cheap lookup (no content column) that carries everything ETag handling needs */
  async getChapterRef(slug: string, ordinal: number): Promise<ChapterRef> {
    const novel = await this.getNovelBySlug(slug);
    const [chapter] = await this.db
      .select({ id: schema.publishedChapters.id, contentHash: schema.publishedChapters.contentHash, revision: schema.publishedChapters.revision })
      .from(schema.publishedChapters)
      .where(and(eq(schema.publishedChapters.novelId, novel.id), eq(schema.publishedChapters.ordinal, ordinal)));
    if (!chapter) throw AppErrorCode.WBN_002.create();
    return { novelSlug: slug, chapterId: chapter.id, ordinal, contentHash: chapter.contentHash, revision: chapter.revision };
  }

  /**
   * Serves the full payload through the in-process LRU. The key carries the revision AND the
   * contentHash: the concurrency rules allow an equal-revision republish with different content,
   * and the hash guarantees such a push can never serve a stale cached body.
   */
  async getChapterContent(ref: ChapterRef): Promise<ChapterContentResponse> {
    const cacheKey = `${ref.novelSlug}:${ref.ordinal}:${ref.revision}:${ref.contentHash}`;
    const cached = this.chapterCache.get<ChapterContentResponse>(cacheKey);
    if (cached) return cached;

    const [chapter] = await this.db.select().from(schema.publishedChapters).where(eq(schema.publishedChapters.id, ref.chapterId));
    if (!chapter) throw AppErrorCode.WBN_002.create();

    const payload: ChapterContentResponse = {
      novelSlug: ref.novelSlug,
      ordinal: chapter.ordinal,
      title: chapter.title,
      content: chapter.content,
      authorNote: chapter.authorNote ?? undefined,
      wordCount: chapter.wordCount ?? undefined,
      revision: chapter.revision,
      publishedAt: chapter.publishedAt?.toISOString(),
    };
    this.chapterCache.set(cacheKey, payload);
    this.logger.debug('chapter payload cached', { cacheKey });
    return payload;
  }

  async getNovelBySlug(slug: string): Promise<Novel> {
    const [novel] = await this.db.select().from(schema.novels).where(eq(schema.novels.slug, slug));
    return novel ?? AppErrorCode.WBN_001.throw();
  }

  private buildFilters(query: NovelCatalogQuery): SQL | undefined {
    const filters: SQL[] = [];
    if (query.search) filters.push(ilike(schema.novels.title, `%${query.search}%`));
    if (query.genre) filters.push(sql`${query.genre} = ANY(${schema.novels.genres})`);
    if (query.status) filters.push(eq(schema.novels.status, query.status));
    return filters.length > 0 ? and(...filters) : undefined;
  }

  private buildOrder(query: NovelCatalogQuery): SQL {
    const column = { title: schema.novels.title, createdAt: schema.novels.createdAt, updatedAt: schema.novels.updatedAt }[query.sortBy];
    return query.sortOrder === 'asc' ? asc(column) : desc(column);
  }

  private toSummary(novel: Novel, chapterCount: number): NovelSummary {
    return {
      slug: novel.slug,
      title: novel.title,
      blurb: novel.blurb ?? undefined,
      coverPath: novel.coverPath ?? undefined,
      genres: novel.genres,
      status: novel.status,
      chapterCount,
      updatedAt: novel.updatedAt.toISOString(),
    };
  }
}
