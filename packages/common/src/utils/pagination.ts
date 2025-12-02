/**
 * Importing npm packages
 */
import assert from 'node:assert';

/**
 * Importing user defined packages
 */
import { CursorPagination, NormalizedPagination, OffsetPagination, PagePagination, PaginationMode, PaginationResult, SortOrder } from '@lib/interfaces';

/**
 * Defining types
 */

export interface NormalizeOptions<T extends PaginationMode = PaginationMode> {
  mode: T;
  defaults: NormalizedPagination<T>;
}

export interface PaginationInput {
  limit?: number | string | null;
  sortBy?: string | null;
  sortOrder?: SortOrder | string | null;
  offset?: number | string | null;
  page?: number | string | null;
  cursor?: string | null;
}

export type GetCursor<Item> = (item: Item) => string;

/**
 * Declaring the constants
 */

class PaginationUtils {
  normalise<T extends PaginationMode>(input: PaginationInput, options: NormalizeOptions<T>): NormalizedPagination<T> {
    const pagination = { ...options.defaults };

    if (input.limit) {
      if (typeof input.limit === 'string') input.limit = parseInt(input.limit);
      if (!isNaN(input.limit) && input.limit > 0) pagination.limit = input.limit;
    }

    if (input.sortBy) pagination.sortBy = input.sortBy;
    if (input.sortOrder) {
      const sortOrder = input.sortOrder.toLowerCase();
      if (sortOrder === 'asc' || sortOrder === 'desc') pagination.sortOrder = sortOrder;
    }

    if (options.mode === 'offset' && input.offset) {
      if (typeof input.offset === 'string') input.offset = parseInt(input.offset);
      if (!isNaN(input.offset) && input.offset >= 0) (pagination as OffsetPagination).offset = input.offset;
    }

    if (options.mode === 'page' && input.page) {
      if (typeof input.page === 'string') input.page = parseInt(input.page);
      if (!isNaN(input.page) && input.page > 0) (pagination as PagePagination).page = input.page;
    }

    if (options.mode === 'cursor' && input.cursor) (pagination as CursorPagination).cursor = input.cursor;

    return pagination;
  }

  createResult<T extends 'offset', Item>(query: NormalizedPagination<T>, items: Item[], total: number): PaginationResult<Item, T>;
  createResult<T extends 'page', Item>(query: NormalizedPagination<T>, items: Item[], total: number): PaginationResult<Item, T>;
  /* eslint-disable-next-line @typescript-eslint/unified-signatures */
  createResult<T extends 'cursor', Item>(query: NormalizedPagination<T>, items: Item[], getCursor: GetCursor<Item>): PaginationResult<Item, T>;
  createResult<T extends PaginationMode, Item>(query: NormalizedPagination<T>, items: Item[], totalOrCursor: number | GetCursor<Item>): PaginationResult<Item, T> {
    if (typeof totalOrCursor === 'number') {
      const total = totalOrCursor;
      if ('offset' in query) return { total, limit: query.limit, offset: query.offset, items } as PaginationResult<Item, T>;
      if ('page' in query) return { total, limit: query.limit, page: query.page, totalPages: Math.ceil(total / query.limit), items } as PaginationResult<Item, T>;
      assert(false, 'Total provided for cursor pagination, expected getCursor function');
    }

    if (items.length === 0) return { limit: query.limit, nextCursor: null, items } as PaginationResult<Item, T>;
    assert(typeof totalOrCursor === 'function', 'getCursor function is required for cursor pagination');

    let resultItems = items;
    let nextCursor: string | null = null;
    if (items.length > query.limit) {
      const lastItem = items[query.limit - 1] as Item;
      resultItems = items.slice(0, query.limit);
      nextCursor = totalOrCursor(lastItem);
    }

    return { limit: query.limit, nextCursor, items: resultItems } as PaginationResult<Item, T>;
  }
}

export const paginationUtils = new PaginationUtils();
