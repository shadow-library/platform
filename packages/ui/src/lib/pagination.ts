import { type PaginationUpdate } from '@/types';

export interface PaginationInfo {
  limit: number;
  skip: number;
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

/** Pure and SSR-safe: `limit` falls back to 20, the total floors at 0 and `currentPage` is clamped to `[1, totalPages]`. */
export function derivePaginationState(totalCount = 0, page = 1, limit = 20): PaginationInfo {
  const safeLimit = limit < 1 ? 20 : Math.floor(limit);
  const safeTotal = Number.isFinite(totalCount) ? Math.max(0, Math.floor(totalCount)) : 0;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const skip = (currentPage - 1) * safeLimit;
  return { totalCount: safeTotal, limit: safeLimit, skip, totalPages, currentPage };
}

export function calculatePageUpdate(info: PaginationInfo, page = 1): PaginationUpdate {
  const skip = (page - 1) * info.limit;
  return { skip: Math.max(0, skip), limit: info.limit };
}
