/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type PaginationUpdate } from '@/types';

/**
 * Defining types
 */

/** Resolved pagination state for a list — everything a pager and a range summary need. */
export interface PaginationInfo {
  limit: number;
  skip: number;
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

/**
 * Declaring the constants
 */

/**
 * Derive page state from a total count and the current `page`/`limit`. Pure and framework-agnostic — the
 * caller supplies `page`/`limit` (from the URL, a store, wherever) rather than the helper reading
 * `window`, so it is deterministic and SSR-safe. Clamps to sane bounds: `limit` falls back to 20, the
 * total floors at 0, and `currentPage` is pinned inside `[1, totalPages]`.
 */
export function derivePaginationState(totalCount = 0, page = 1, limit = 20): PaginationInfo {
  const safeLimit = limit < 1 ? 20 : Math.floor(limit);
  const safeTotal = Number.isFinite(totalCount) ? Math.max(0, Math.floor(totalCount)) : 0;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const skip = (currentPage - 1) * safeLimit;
  return { totalCount: safeTotal, limit: safeLimit, skip, totalPages, currentPage };
}

/** Translate a 1-based target page into the `{ skip, limit }` patch for the next query. */
export function calculatePageUpdate(info: PaginationInfo, page = 1): PaginationUpdate {
  const skip = (page - 1) * info.limit;
  return { skip: Math.max(0, skip), limit: info.limit };
}
