/**
 * Importing npm packages
 */
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
type SearchParams = Record<string, string>;

type SearchInput = Record<string, string | boolean | number | undefined>;

export interface UseSearchParams {
  search: SearchParams;
  appendSearch: (params: SearchInput) => void;
  setSearch: (params: SearchInput) => void;
}

/**
 * Declaring the constants
 */
function cleanParams(params: SearchInput): SearchParams {
  const cleaned: SearchParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined) cleaned[key] = String(value);
  }
  return cleaned;
}

/** Read and update the URL query params through TanStack Router, dropping empty/undefined values. */
export function useSearchParams(): UseSearchParams {
  const router = useRouter();
  // `router.state` is a plain snapshot read through non-reactive `useRouter()`; a search-only navigation
  // (e.g. appendSearch) doesn't remount the matched route, so without subscribing here the caller would
  // keep rendering with a stale `search` and never re-issue the query that depends on it.
  const search = useRouterState({ select: state => state.location.search as SearchParams });
  const appendSearch = useCallback((params: SearchInput) => router.navigate({ search: cleanParams({ ...search, ...params }) as never }), [router, search]);
  const setSearch = useCallback((params: SearchInput) => router.navigate({ search: cleanParams(params) as never }), [router]);

  return useMemo(() => ({ search, appendSearch, setSearch }), [search, appendSearch, setSearch]);
}
