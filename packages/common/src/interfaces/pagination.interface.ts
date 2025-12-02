/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type SortOrder = 'asc' | 'desc';

export type PaginationMode = 'offset' | 'page' | 'cursor';

interface BasePagination {
  limit: number;
  sortBy: string;
  sortOrder: SortOrder;
}

export interface OffsetPagination extends BasePagination {
  offset: number;
}

export interface PagePagination extends BasePagination {
  page: number;
}

export interface CursorPagination extends BasePagination {
  cursor: string | null;
}

export type NormalizedPagination<T extends PaginationMode = PaginationMode> = T extends 'offset'
  ? OffsetPagination
  : T extends 'page'
    ? PagePagination
    : T extends 'cursor'
      ? CursorPagination
      : never;

export interface OffsetPaginationResult<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

export interface PagePaginationResult<T> {
  total: number;
  limit: number;
  page: number;
  totalPages: number;
  items: T[];
}

export interface CursorPaginationResult<T> {
  limit: number;
  nextCursor: string | null;
  items: T[];
}

export type PaginationResult<T, U extends PaginationMode = PaginationMode> = U extends 'offset'
  ? OffsetPaginationResult<T>
  : U extends 'page'
    ? PagePaginationResult<T>
    : U extends 'cursor'
      ? CursorPaginationResult<T>
      : never;
