import { queryOptions } from '@tanstack/react-query';

import { type ApiError, APIRequest } from './transport';
import { type WikiEntryDetail, type WikiEntryType, type WikiIndex } from './types';

/** Wire shapes match the client model 1:1, so no mapper. Spoiler gating is entirely server-side; the client never filters further. */
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
 * Paths are surface-relative (`APIRequest` is rooted at `/api`). A 404 for an unknown novel, or a missing or spoiler-locked entry (answered identically
 * so existence can't be probed), bubbles to the router's error boundary.
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
