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
import { type CatalogQuery, type CatalogResponse, type ChapterContent, type ChapterListResponse, type NovelDetail } from './types';

/**
 * Defining types
 */

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

function notFound(message: string): ApiError {
  return new ApiError(404, { code: 'NOT_FOUND', type: 'NotFoundError', message });
}

export const catalogQueryOptions = (query: CatalogQuery = {}) =>
  queryOptions<CatalogResponse, ApiError>({
    queryKey: novelKeys.catalog(query),
    queryFn: ({ signal }) => {
      if (useFixtures) return fixtureDelay(fixtureCatalog(query));
      return APIRequest.get('/api/novels')
        .query({ q: query.q, genre: query.genre, status: query.status, sort: query.sort, page: query.page, limit: query.limit })
        .signal(signal)
        .timeout(10_000)
        .execute<CatalogResponse>();
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
      return APIRequest.get(`/api/novels/${encodeURIComponent(slug)}`)
        .signal(signal)
        .timeout(10_000)
        .execute<NovelDetail>();
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
      return APIRequest.get(`/api/novels/${encodeURIComponent(slug)}/chapters`)
        .query({ page, limit })
        .signal(signal)
        .timeout(10_000)
        .execute<ChapterListResponse>();
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
        return await APIRequest.get(`/api/novels/${encodeURIComponent(slug)}/chapters/${ordinal}`)
          .signal(signal)
          .timeout(10_000)
          .execute<ChapterContent>();
      } catch (error) {
        const stored = await downloaded();
        if (stored) return stored;
        throw error;
      }
    },
  });

/** The loader used when explicitly downloading chapters for offline reading. */
export function fetchChapter(slug: string, ordinal: number): Promise<ChapterContent> {
  if (useFixtures) {
    const chapter = fixtureChapter(slug, ordinal);
    if (!chapter) throw notFound(`Chapter ${ordinal} does not exist`);
    return fixtureDelay(chapter, 40);
  }
  return APIRequest.get(`/api/novels/${encodeURIComponent(slug)}/chapters/${ordinal}`)
    .timeout(15_000)
    .execute<ChapterContent>();
}
