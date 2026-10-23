import { useRouter, useRouterState } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

type SearchParams = Record<string, string>;

type SearchInput = Record<string, string | boolean | number | undefined>;

export interface UseSearchParams {
  search: SearchParams;
  appendSearch: (params: SearchInput) => void;
  setSearch: (params: SearchInput) => void;
}

function cleanParams(params: SearchInput): SearchParams {
  const cleaned: SearchParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined) cleaned[key] = String(value);
  }
  return cleaned;
}

/** `appendSearch` merges into the current params, `setSearch` replaces them; both drop empty and undefined values. */
export function useSearchParams(): UseSearchParams {
  const router = useRouter();
  // Subscribed because `useRouter()` state is a non-reactive snapshot and a search-only navigation doesn't remount the route, which would leave `search` stale.
  const search = useRouterState({ select: state => state.location.search as SearchParams });
  const appendSearch = useCallback((params: SearchInput) => router.navigate({ search: cleanParams({ ...search, ...params }) as never }), [router, search]);
  const setSearch = useCallback((params: SearchInput) => router.navigate({ search: cleanParams(params) as never }), [router]);

  return useMemo(() => ({ search, appendSearch, setSearch }), [search, appendSearch, setSearch]);
}
