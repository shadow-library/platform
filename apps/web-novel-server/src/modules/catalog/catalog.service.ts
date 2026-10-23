import { and, asc, count, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { type PgColumn } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { type AuthPrincipal } from '@shadow-library/auth';
import { AppError, Config, Logger, LRUCache } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { CONTENT_RATING_LEVELS, type ContentRatingDimension, type ContentRatingLevel, ratingRank } from '@shadow-library/sdk';

import { AppErrorCode, isImageRef } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Novel, type PrimaryDatabase, schema } from '@server/modules/datastore';

import { type ChapterContentResponse, type ChapterMetaItem, type NovelCatalogQuery, type NovelCatalogResponse, type NovelDetailResponse, type NovelSummary } from './catalog.dto';
import { NovelAccessService } from './novel-access.service';

export interface ChapterRef {
  novelSlug: string;
  chapterId: bigint;
  ordinal: number;
  contentHash: string;
  revision: number;
  visibility: Novel['visibility'];
}

const CHAPTER_CACHE_CAPACITY = 512;

const RATING_COLUMNS = {
  sexualContent: schema.novels.sexualContent,
  violence: schema.novels.violence,
  darkContent: schema.novels.darkContent,
} as const satisfies Record<ContentRatingDimension, PgColumn>;

@Injectable()
export class CatalogService {
  private readonly logger = Logger.getLogger(APP_NAME, CatalogService.name);
  private readonly chapterCache = new LRUCache(CHAPTER_CACHE_CAPACITY);
  private readonly db: PrimaryDatabase;
  private readonly publicOrigin: string;

  constructor(
    databaseService: DatabaseService,
    private readonly accessService: NovelAccessService,
  ) {
    this.db = databaseService.getPostgresClient();
    const origin = Config.get('storage.public-origin');
    if (!origin) throw AppError.internal("config key 'storage.public-origin' is not set");
    this.publicOrigin = origin.replace(/\/+$/, '');
  }

  async listNovels(query: NovelCatalogQuery): Promise<NovelCatalogResponse> {
    const filters = this.buildFilters(query);
    /** Written raw and fully qualified: drizzle renders embedded columns unqualified inside sql`` fragments, silently mis-correlating the subquery. */
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

  async getNovel(slug: string, principal: AuthPrincipal | null): Promise<NovelDetailResponse> {
    const novel = await this.getReadableNovel(slug, principal);
    const [chapters] = await this.db.select({ value: count() }).from(schema.publishedChapters).where(eq(schema.publishedChapters.novelId, novel.id));
    return { ...this.toSummary(novel, chapters?.value ?? 0), createdAt: novel.createdAt.toISOString() };
  }

  async listChapters(slug: string, principal: AuthPrincipal | null): Promise<{ items: ChapterMetaItem[]; visibility: Novel['visibility'] }> {
    const novel = await this.getReadableNovel(slug, principal);
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

    const items = chapters.map(chapter => ({
      ordinal: chapter.ordinal,
      title: chapter.title,
      wordCount: chapter.wordCount ?? undefined,
      publishedAt: chapter.publishedAt?.toISOString(),
    }));
    return { items, visibility: novel.visibility };
  }

  async getChapterRef(slug: string, ordinal: number, principal: AuthPrincipal | null): Promise<ChapterRef> {
    const novel = await this.getReadableNovel(slug, principal);
    const [chapter] = await this.db
      .select({ id: schema.publishedChapters.id, contentHash: schema.publishedChapters.contentHash, revision: schema.publishedChapters.revision })
      .from(schema.publishedChapters)
      .where(and(eq(schema.publishedChapters.novelId, novel.id), eq(schema.publishedChapters.ordinal, ordinal)));
    if (!chapter) throw AppErrorCode.WBN_002.create();
    return { novelSlug: slug, chapterId: chapter.id, ordinal, contentHash: chapter.contentHash, revision: chapter.revision, visibility: novel.visibility };
  }

  /** The single door for by-slug reads: an unreadable novel answers `WBN_001`, identical to an unknown slug, so a private novel's existence cannot be confirmed. */
  async getReadableNovel(slug: string, principal: AuthPrincipal | null): Promise<Novel> {
    const novel = await this.getNovelBySlug(slug);
    if (await this.accessService.canRead(novel, principal)) return novel;
    this.accessService.logDenial(slug, principal, novel.visibility);
    throw AppErrorCode.WBN_001.create();
  }

  /** The cache key carries revision and contentHash: an equal-revision republish may change content, and the hash keeps it from serving a stale body. */
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

  /** Listings only ever see `PUBLIC`, whoever asks; shared novels are reached through the reader's shared shelf or by slug. */
  private buildFilters(query: NovelCatalogQuery): SQL {
    const filters: SQL[] = [eq(schema.novels.visibility, 'PUBLIC')];
    if (query.search) filters.push(ilike(schema.novels.title, `%${query.search}%`));
    if (query.genre) filters.push(sql`${query.genre} = ANY(${schema.novels.genres})`);
    if (query.tag) filters.push(sql`${query.tag} = ANY(${schema.novels.tags})`);
    if (query.status) filters.push(eq(schema.novels.status, query.status));
    if (query.maxSexualContent) filters.push(this.ratingCeiling('sexualContent', query.maxSexualContent));
    if (query.maxViolence) filters.push(this.ratingCeiling('violence', query.maxViolence));
    if (query.maxDarkContent) filters.push(this.ratingCeiling('darkContent', query.maxDarkContent));
    return and(...filters) as SQL;
  }

  /** Levels are `varchar`, so a raw `<=` compares alphabetically; `CASE` maps them to ranks. Unrated (`NULL`) yields `NULL` and is excluded. */
  private ratingCeiling<D extends ContentRatingDimension>(dimension: D, ceiling: ContentRatingLevel<D>): SQL {
    const column = RATING_COLUMNS[dimension];
    const cases = CONTENT_RATING_LEVELS[dimension].map(level => sql`WHEN ${level} THEN ${ratingRank(dimension, level as ContentRatingLevel<D>)}`);
    const rank = sql`CASE ${column} ${sql.join(cases, sql` `)} END`;
    return sql`(${rank}) <= ${ratingRank(dimension, ceiling)}`;
  }

  private buildOrder(query: NovelCatalogQuery): SQL {
    const column = { title: schema.novels.title, createdAt: schema.novels.createdAt, updatedAt: schema.novels.updatedAt }[query.sortBy];
    return query.sortOrder === 'asc' ? asc(column) : desc(column);
  }

  imageUrl(ref: string | null | undefined): string | undefined {
    if (!isImageRef(ref)) return undefined;
    return `${this.publicOrigin}/${ref}`;
  }

  private toSummary(novel: Novel, chapterCount: number): NovelSummary {
    return {
      slug: novel.slug,
      title: novel.title,
      author: novel.originalAuthor ?? undefined,
      blurb: novel.blurb ?? undefined,
      coverUrl: this.imageUrl(novel.coverPath),
      genres: novel.genres,
      tags: novel.tags,
      sexualContent: novel.sexualContent ?? undefined,
      violence: novel.violence ?? undefined,
      darkContent: novel.darkContent ?? undefined,
      status: novel.status,
      visibility: novel.visibility,
      chapterCount,
      updatedAt: novel.updatedAt.toISOString(),
    };
  }
}
