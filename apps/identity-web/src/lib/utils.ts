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

  /** Derive page state from a total count and the current `page`/`limit` (defaults to page 1). */
  derivePaginationState(totalCount = 0, page = 1, limit = 20): PaginationInfo {
    const safeLimit = limit < 1 ? 20 : limit;
    const safeTotal = Number.isFinite(totalCount) ? Math.max(0, Math.floor(totalCount)) : 0;
    const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const skip = (currentPage - 1) * safeLimit;
    return { totalCount: safeTotal, limit: safeLimit, skip, totalPages, currentPage };
  },

  calculatePageUpdate(paginationInfo: PaginationInfo, page = 1): PaginationUpdate {
    const { limit } = paginationInfo;
    const skip = (page - 1) * limit;
    return { skip: Math.max(0, skip), limit };
  },
};

/** Copy text to the clipboard, resolving to whether it succeeded (for a "Copied" affordance). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Trigger a browser download of a text blob — used to save one-time recovery codes. */
export function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
