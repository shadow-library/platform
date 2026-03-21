/**
 * Importing npm packages
 */
import { useRouter } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

type SearchParams = Record<string, string>;

type SearchInput = Record<string, string | boolean | number | undefined>;

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

export function useSearchParams(): { search: SearchParams; appendSearch: (params: SearchInput) => void; setSearch: (params: SearchInput) => void } {
  const router = useRouter();
  const search = router.state.location.search as SearchParams;
  const appendSearch = useCallback((params: SearchInput) => router.navigate({ search: cleanParams({ ...search, ...params }) as never }), [router]);
  const setSearch = useCallback((params: SearchInput) => router.navigate({ search: cleanParams(params) as never }), [router]);

  return useMemo(() => ({ search, appendSearch, setSearch }), [search, appendSearch, setSearch]);
}
