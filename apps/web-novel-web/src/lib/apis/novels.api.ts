/**
 * Importing npm packages
 */
import { queryOptions } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { chapterKey, offlineStore } from '@/lib/offline';

import { fixtureCatalog, fixtureChapter, fixtureChapterList, fixtureNovel } from './fixtures';
import { ApiError, APIRequest, fixtureDelay, useFixtures } from './transport';
import {
  type CatalogQuery,
  type CatalogResponse,
  type CatalogSort,
  type ChapterContent,
  type ChapterListResponse,
  type NovelCover,
  type NovelDetail,
  type NovelStatus,
  type NovelSummary,
} from './types';

/**
 * Defining types
 *
 * The live webnovel-server wire shapes (verified against its catalog DTOs). The server publishes a leaner
 * model than the fixture-era client one — no author/rating/views, `blurb` for `synopsis`, `live`/`retired`
 * for status, raw `content` text, and `limit`/`offset` paging — so the mappers below normalize every
 * response into the client model at this boundary and the rest of the app stays shape-agnostic.
 */

export type ServerNovelStatus = 'live' | 'retired';

interface ServerNovelSummary {
  slug: string;
  title: string;
  blurb?: string;
  coverPath?: string;
  genres: string[];
  status: ServerNovelStatus;
  chapterCount: number;
  updatedAt: string;
}

interface ServerNovelDetail extends ServerNovelSummary {
  createdAt: string;
}

interface ServerCatalogResponse {
  total: number;
  limit: number;
  offset: number;
  items: ServerNovelSummary[];
}

interface ServerChapterMeta {
  ordinal: number;
  title: string;
  wordCount?: number;
  publishedAt?: string;
}

interface ServerChapterContent {
  novelSlug: string;
  ordinal: number;
  title: string;
  content: string;
  authorNote?: string;
  wordCount?: number;
  revision: number;
  publishedAt?: string;
}

/**
 * Declaring the constants
 *
 * The canonical webnovel-server read surface. Every query forwards TanStack Query's abort `signal` into
 * `APIRequest.signal(...)` so navigation cancels in-flight requests; fixture mode answers locally in dev.
 */
export const novelKeys = {
  catalog: (query: CatalogQuery) => ['novels', 'catalog', query] as const,
  detail: (slug: string) => ['novels', 'detail', slug] as const,
  chapters: (slug: string, page: number, limit: number) => ['novels', 'chapters', slug, page, limit] as const,
  chapter: (slug: string, ordinal: number) => ['novels', 'chapter', slug, ordinal] as const,
};

/** Cover artwork stays a deterministic slug-keyed gradient until the server serves real cover assets */
const COVER_PALETTE: NovelCover[] = [
  { from: '#6366f1', to: '#312e81' },
  { from: '#0ea5e9', to: '#0c4a6e' },
  { from: '#f43f5e', to: '#4c0519' },
  { from: '#a855f7', to: '#3b0764' },
  { from: '#10b981', to: '#064e3b' },
  { from: '#14b8a6', to: '#134e4a' },
  { from: '#f59e0b', to: '#451a03' },
  { from: '#8b5cf6', to: '#2e1065' },
];

export const STATUS_FROM_SERVER: Record<ServerNovelStatus, NovelStatus> = { live: 'ongoing', retired: 'completed' };
const STATUS_TO_SERVER: Record<NovelStatus, ServerNovelStatus> = { ongoing: 'live', hiatus: 'live', completed: 'retired' };

const SORT_TO_SERVER: Record<CatalogSort, { sortBy: 'updatedAt' | 'createdAt' | 'title'; sortOrder: 'asc' | 'desc' }> = {
  trending: { sortBy: 'updatedAt', sortOrder: 'desc' },
  popular: { sortBy: 'updatedAt', sortOrder: 'desc' },
  rating: { sortBy: 'updatedAt', sortOrder: 'desc' },
  updated: { sortBy: 'updatedAt', sortOrder: 'desc' },
  chapters: { sortBy: 'updatedAt', sortOrder: 'desc' },
  title: { sortBy: 'title', sortOrder: 'asc' },
};

function notFound(message: string): ApiError {
  return new ApiError(404, { code: 'NOT_FOUND', type: 'NotFoundError', message });
}

export function coverFor(slug: string): NovelCover {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVER_PALETTE[hash % COVER_PALETTE.length] as NovelCover;
}

function toSummary(item: ServerNovelSummary): NovelSummary {
  return {
    slug: item.slug,
    title: item.title,
    author: 'Unknown author',
    genres: item.genres,
    status: STATUS_FROM_SERVER[item.status],
    rating: 0,
    ratingCount: 0,
    chapterCount: item.chapterCount,
    synopsis: item.blurb ?? '',
    updatedAt: item.updatedAt,
    views: 0,
    cover: coverFor(item.slug),
  };
}

function toDetail(item: ServerNovelDetail): NovelDetail {
  return { ...toSummary(item), alternativeTitles: [], tags: item.genres, language: 'English', mature: false };
}

/** Nav derives from the published chapter list — ordinals may hold gaps after an unpublish */
function toChapterContent(chapter: ServerChapterContent, chapters: ServerChapterMeta[], novelTitle: string): ChapterContent {
  const ordinals = chapters.map(meta => meta.ordinal).sort((a, b) => a - b);
  return {
    novelSlug: chapter.novelSlug,
    novelTitle,
    ordinal: chapter.ordinal,
    title: chapter.title,
    paragraphs: chapter.content
      .split(/\n+/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean),
    contentHash: `r${chapter.revision}`,
    previousOrdinal: ordinals.filter(ordinal => ordinal < chapter.ordinal).at(-1),
    nextOrdinal: ordinals.find(ordinal => ordinal > chapter.ordinal),
    totalChapters: ordinals.length,
  };
}

export const catalogQueryOptions = (query: CatalogQuery = {}) =>
  queryOptions<CatalogResponse, ApiError>({
    queryKey: novelKeys.catalog(query),
    queryFn: async ({ signal }) => {
      if (useFixtures) return fixtureDelay(fixtureCatalog(query));
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const sort = SORT_TO_SERVER[query.sort ?? 'trending'];
      const response = await APIRequest.get('/novels')
        .query({
          search: query.q,
          genre: query.genre,
          status: query.status && STATUS_TO_SERVER[query.status],
          sortBy: sort.sortBy,
          sortOrder: sort.sortOrder,
          limit,
          offset: (page - 1) * limit,
        })
        .signal(signal)
        .timeout(10_000)
        .execute<ServerCatalogResponse>();
      const items = response.items.map(toSummary);
      const genres = [...new Set(items.flatMap(item => item.genres))].sort();
      return { items, total: response.total, page, pageSize: limit, genres };
    },
  });

export const novelQueryOptions = (slug: string) =>
  queryOptions<NovelDetail, ApiError>({
    queryKey: novelKeys.detail(slug),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => {
      if (useFixtures) {
        const novel = fixtureNovel(slug);
        if (!novel) throw notFound(`No novel named "${slug}"`);
        return fixtureDelay(novel);
      }
      return APIRequest.get(`/novels/${encodeURIComponent(slug)}`)
        .signal(signal)
        .timeout(10_000)
        .execute<ServerNovelDetail>()
        .then(toDetail);
    },
  });

export const chapterListQueryOptions = (slug: string, page = 1, limit = 100) =>
  queryOptions<ChapterListResponse, ApiError>({
    queryKey: novelKeys.chapters(slug, page, limit),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => {
      if (useFixtures) {
        const list = fixtureChapterList(slug, page, limit);
        if (!list) throw notFound(`No novel named "${slug}"`);
        return fixtureDelay(list);
      }
      // The live list endpoint returns every published chapter in one page; paging stays a fixture affordance.
      return APIRequest.get(`/novels/${encodeURIComponent(slug)}/chapters`)
        .signal(signal)
        .timeout(10_000)
        .execute<{ items: ServerChapterMeta[] }>()
        .then(({ items }) => ({ items: items.map(meta => ({ ordinal: meta.ordinal, title: meta.title, releasedAt: meta.publishedAt ?? '' })), total: items.length }));
    },
  });

/**
 * Chapter content is immutable per `contentHash` (the server's ETag), so it stays fresh for a long time and
 * the service worker caches it cache-first. When the network is unreachable the query falls back to the
 * explicitly-downloaded copy in the `OfflineStore`, keeping downloaded chapters readable with no worker at all.
 */
export const chapterQueryOptions = (slug: string, ordinal: number) =>
  queryOptions<ChapterContent, ApiError>({
    queryKey: novelKeys.chapter(slug, ordinal),
    staleTime: 60 * 60_000,
    queryFn: async ({ signal }) => {
      const downloaded = () => offlineStore.get<ChapterContent>(chapterKey(slug, ordinal));
      if (useFixtures) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const stored = await downloaded();
          if (stored) return stored;
          throw new ApiError(-1, { code: 'OFFLINE', type: 'NetworkError', message: 'This chapter is not downloaded' });
        }
        const chapter = fixtureChapter(slug, ordinal);
        if (!chapter) throw notFound(`Chapter ${ordinal} does not exist`);
        return fixtureDelay(chapter);
      }
      try {
        return await fetchLiveChapter(slug, ordinal, signal);
      } catch (error) {
        const stored = await downloaded();
        if (stored) return stored;
        throw error;
      }
    },
  });

/** The chapter body carries no nav or novel context of its own, so the list and detail ride along in parallel */
async function fetchLiveChapter(slug: string, ordinal: number, signal?: AbortSignal): Promise<ChapterContent> {
  const base = `/novels/${encodeURIComponent(slug)}`;
  const chapterRequest = APIRequest.get(`${base}/chapters/${ordinal}`).timeout(15_000);
  if (signal) chapterRequest.signal(signal);
  const [chapter, list, novel] = await Promise.all([
    chapterRequest.execute<ServerChapterContent>(),
    APIRequest.get(`${base}/chapters`).timeout(15_000).execute<{ items: ServerChapterMeta[] }>(),
    APIRequest.get(base).timeout(15_000).execute<ServerNovelDetail>(),
  ]);
  return toChapterContent(chapter, list.items, novel.title);
}

/** The loader used when explicitly downloading chapters for offline reading. */
export function fetchChapter(slug: string, ordinal: number): Promise<ChapterContent> {
  if (useFixtures) {
    const chapter = fixtureChapter(slug, ordinal);
    if (!chapter) throw notFound(`Chapter ${ordinal} does not exist`);
    return fixtureDelay(chapter, 40);
  }
  return fetchLiveChapter(slug, ordinal);
}
