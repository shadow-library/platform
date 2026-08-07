import { queryOptions } from '@tanstack/react-query';

import { type ApiError, APIRequest } from './transport';
import { type WikiEntryDetail, type WikiEntryType, type WikiIndex } from './types';

/**
 * The live webnovel-server wiki wire shapes (verified against `WikiListResponse`/`WikiEntryDetailResponse` in
 * `wiki.dto.ts`, and against the regenerated `api-types.gen.ts`). The shapes already match the client model
 * 1:1, so no mapper is needed at this boundary — unlike `novels.api.ts`, which normalizes a leaner server
 * shape. Spoiler gating (which entries/facets are visible, and the two "more unlock as you read" counters)
 * is decided entirely server-side from the reader's progress; the client never filters further.
 */
interface ServerWikiListItem {
  entryKey: string;
  type: WikiEntryType;
  name: string;
  imageUrl?: string;
}

interface ServerWikiListResponse {
  items: ServerWikiListItem[];
  lockedCount: number;
}

interface ServerWikiFacetItem {
  facetKey: string;
  content: string;
  sortOrder: number;
}

interface ServerWikiImageItem {
  imageUrl: string;
  caption?: string;
  sortOrder: number;
}

interface ServerWikiEntryDetailResponse extends ServerWikiListItem {
  facets: ServerWikiFacetItem[];
  images: ServerWikiImageItem[];
  hiddenFacetCount: number;
}

/**
 * The reader's wiki read surface. Both endpoints forward TanStack Query's abort `signal` so navigation
 * cancels in-flight requests, and paths are surface-relative (`/novels/:slug/wiki`) because `APIRequest` is
 * already rooted at `/api`. A 404 — an unknown novel, or a wiki entry that is missing *or still
 * spoiler-locked* (the server answers both identically so existence can't be probed) — bubbles to the
 * router's default error boundary exactly like an unknown novel slug does.
 */
export const wikiKeys = {
  index: (slug: string) => ['novels', 'wiki', slug] as const,
  entry: (slug: string, entryKey: string) => ['novels', 'wiki', slug, entryKey] as const,
};

export const wikiIndexQueryOptions = (slug: string) =>
  queryOptions<WikiIndex, ApiError>({
    queryKey: wikiKeys.index(slug),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      APIRequest.get(`/novels/${encodeURIComponent(slug)}/wiki`)
        .signal(signal)
        .timeout(10_000)
        .execute<ServerWikiListResponse>(),
  });

export const wikiEntryQueryOptions = (slug: string, entryKey: string) =>
  queryOptions<WikiEntryDetail, ApiError>({
    queryKey: wikiKeys.entry(slug, entryKey),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      APIRequest.get(`/novels/${encodeURIComponent(slug)}/wiki/${encodeURIComponent(entryKey)}`)
        .signal(signal)
        .timeout(10_000)
        .execute<ServerWikiEntryDetailResponse>(),
  });
