/**
 * Importing npm packages
 */
import { useEffect, useRef, useState } from 'react';
import { type SortDirection, type TableSort, toPositiveInt } from '@shadow-library/ui';
import { useSearchParams } from '@shadow-library/web/router';

/**
 * Defining types
 */
export interface TablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/**
 * Bridges the URL `offset`/`limit` state (what the server paginates on) to the page-based
 * `Pagination` component.
 */
export function useTablePagination(total: number | undefined, defaultLimit = 20): TablePagination {
  const { search, appendSearch } = useSearchParams();
  const safeTotal = total ?? 0;
  const limit = toPositiveInt(search.limit) ?? defaultLimit;
  const totalPages = Math.max(1, Math.ceil(safeTotal / limit));
  const maxOffset = Math.max(0, (totalPages - 1) * limit);
  const offset = Math.min(toPositiveInt(search.offset, true) ?? 0, maxOffset);

  return {
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
    total: safeTotal,
    onPageChange: page => appendSearch({ offset: Math.max(0, (page - 1) * limit), limit }),
    onPageSizeChange: size => appendSearch({ limit: size, offset: 0 }),
  };
}

/**
 * URL-backed single-column sort for `Table`. Only time columns (`createdAt`/`updatedAt`) are
 * server-sortable, so those are the ids to pass as sortable column ids.
 */
export function useTableSort(defaultSort: TableSort): { sort: TableSort; onSortChange: (sort: TableSort | null) => void } {
  const { search, appendSearch } = useSearchParams();
  const sort: TableSort = search.sortBy ? { id: search.sortBy, direction: (search.sortOrder as SortDirection) ?? 'desc' } : defaultSort;

  const onSortChange = (next: TableSort | null): void => {
    if (next) appendSearch({ sortBy: next.id, sortOrder: next.direction });
    else appendSearch({ sortBy: '', sortOrder: '' });
  };

  return { sort, onSortChange };
}

/**
 * Local input state mirrored to a URL search param after a debounce (resets `offset`).
 * Drives the live search/filter text inputs without a request per keystroke.
 */
export function useDebouncedParam(key: string, delay = 300): [string, (value: string) => void] {
  const { search, appendSearch } = useSearchParams();
  const [value, setValue] = useState(search[key] ?? '');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => appendSearch({ [key]: value, offset: 0 }), delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return [value, setValue];
}
