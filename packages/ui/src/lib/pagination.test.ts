/**
 * Importing npm packages
 */
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { calculatePageUpdate, derivePaginationState } from './pagination';

/**
 * Declaring the constants
 */

describe('derivePaginationState', () => {
  it('derives page state from total, page, and limit', () => {
    expect(derivePaginationState(95, 3, 20)).toEqual({ totalCount: 95, limit: 20, skip: 40, totalPages: 5, currentPage: 3 });
  });

  it('always reports at least one page, even with no items', () => {
    expect(derivePaginationState(0)).toEqual({ totalCount: 0, limit: 20, skip: 0, totalPages: 1, currentPage: 1 });
  });

  it('clamps the current page into range', () => {
    expect(derivePaginationState(30, 99, 10).currentPage).toBe(3);
    expect(derivePaginationState(30, -5, 10).currentPage).toBe(1);
  });

  it('falls back to a limit of 20 and floors a negative total', () => {
    expect(derivePaginationState(-5, 1, 0)).toEqual({ totalCount: 0, limit: 20, skip: 0, totalPages: 1, currentPage: 1 });
  });

  it('is pure — no window access, identical output across calls', () => {
    expect(derivePaginationState(100, 2, 25)).toEqual(derivePaginationState(100, 2, 25));
  });
});

describe('calculatePageUpdate', () => {
  it('translates a target page into a skip/limit patch', () => {
    const info = derivePaginationState(95, 1, 20);
    expect(calculatePageUpdate(info, 3)).toEqual({ skip: 40, limit: 20 });
  });

  it('never returns a negative skip', () => {
    const info = derivePaginationState(95, 1, 20);
    expect(calculatePageUpdate(info, 0)).toEqual({ skip: 0, limit: 20 });
  });
});
