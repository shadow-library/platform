/**
 * Importing npm packages
 */

import { type PaginationUpdate } from '@/types';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

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

export const utils = {
  toPositiveInt(value?: string | null, allowZero = false): number | null {
    if (!value) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const num = Math.floor(n);
    return num > 0 || (allowZero && num === 0) ? num : null;
  },

  derivePaginationState(totalCount = 0, defaultLimit = 20): PaginationInfo {
    if (defaultLimit < 1) defaultLimit = 20;
    const safeTotal = Number.isFinite(totalCount) ? Math.max(0, Math.floor(totalCount)) : 0;
    const params = new URLSearchParams(window.location.search);
    const limit = utils.toPositiveInt(params.get('limit')) ?? defaultLimit;
    const totalPages = Math.max(1, Math.ceil(safeTotal / limit));

    const maxSkip = Math.max(0, (totalPages - 1) * limit);
    let skip = utils.toPositiveInt(params.get('skip'), true) ?? 0;
    skip = Math.min(skip, maxSkip);

    const currentPage = Math.min(totalPages, Math.floor(skip / limit) + 1);
    return { totalCount: safeTotal, limit, skip, totalPages, currentPage };
  },

  calculatePageUpdate(paginationInfo: PaginationInfo, page = 1): PaginationUpdate {
    const { limit } = paginationInfo;
    const skip = (page - 1) * limit;
    return { skip: Math.max(0, skip), limit };
  },
};
