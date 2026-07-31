/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { CursorPagination, OffsetPagination, PagePagination } from '@lib/interfaces';
import { utils } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Pagination Utils', () => {
  describe('normalise', () => {
    describe('offset mode', () => {
      const defaults = { limit: 10, sortBy: 'createdAt', sortOrder: 'desc' as const, offset: 0 };
      const options = { mode: 'offset' as const, defaults };

      it('should return defaults when input is empty', () => {
        const result = utils.pagination.normalise({}, options);

        expect(result).toStrictEqual(defaults);
      });

      it('should parse and apply limit from string', () => {
        const result = utils.pagination.normalise({ limit: '25' }, options);

        expect(result).toStrictEqual({ ...defaults, limit: 25 });
      });

      it('should parse and apply limit from number', () => {
        const result = utils.pagination.normalise({ limit: 50 }, options);

        expect(result).toStrictEqual({ ...defaults, limit: 50 });
      });

      it('should ignore invalid limit values', () => {
        const result1 = utils.pagination.normalise({ limit: 'invalid' }, options);
        const result2 = utils.pagination.normalise({ limit: -5 }, options);
        const result3 = utils.pagination.normalise({ limit: 0 }, options);

        expect(result1).toStrictEqual(defaults);
        expect(result2).toStrictEqual(defaults);
        expect(result3).toStrictEqual(defaults);
      });

      it('should apply sortBy', () => {
        const result = utils.pagination.normalise({ sortBy: 'updatedAt' }, options);

        expect(result).toStrictEqual({ ...defaults, sortBy: 'updatedAt' });
      });

      it('should apply valid sortOrder', () => {
        const result1 = utils.pagination.normalise({ sortOrder: 'asc' }, options);
        const result2 = utils.pagination.normalise({ sortOrder: 'ASC' }, options);
        expect(result1).toStrictEqual({ ...defaults, sortOrder: 'asc' });
        expect(result2).toStrictEqual({ ...defaults, sortOrder: 'asc' });
      });

      it('should ignore invalid sortOrder', () => {
        const result = utils.pagination.normalise({ sortOrder: 'invalid' }, options);

        expect(result).toStrictEqual(defaults);
      });

      it('should parse and apply offset from string', () => {
        const result = utils.pagination.normalise({ offset: '20' }, options);

        expect(result).toStrictEqual({ ...defaults, offset: 20 });
      });

      it('should parse and apply offset from number', () => {
        const result = utils.pagination.normalise({ offset: 30 }, options);

        expect(result).toStrictEqual({ ...defaults, offset: 30 });
      });

      it('should allow offset of 0', () => {
        const result = utils.pagination.normalise({ offset: 0 }, options);

        expect(result).toStrictEqual({ ...defaults, offset: 0 });
      });

      it('should ignore negative offset', () => {
        const result = utils.pagination.normalise({ offset: -10 }, options);

        expect(result).toStrictEqual(defaults);
      });
    });

    describe('page mode', () => {
      const defaults = { limit: 10, sortBy: 'createdAt', sortOrder: 'desc' as const, page: 1 };
      const options = { mode: 'page' as const, defaults };

      it('should return defaults when input is empty', () => {
        const result = utils.pagination.normalise({}, options);

        expect(result).toStrictEqual(defaults);
      });

      it('should parse and apply page from string', () => {
        const result = utils.pagination.normalise({ page: '5' }, options);

        expect(result).toStrictEqual({ ...defaults, page: 5 });
      });

      it('should parse and apply page from number', () => {
        const result = utils.pagination.normalise({ page: 3 }, options);

        expect(result).toStrictEqual({ ...defaults, page: 3 });
      });

      it('should ignore invalid page values', () => {
        const result1 = utils.pagination.normalise({ page: 'invalid' }, options);
        const result2 = utils.pagination.normalise({ page: 0 }, options);
        const result3 = utils.pagination.normalise({ page: -1 }, options);

        expect(result1).toStrictEqual(defaults);
        expect(result2).toStrictEqual(defaults);
        expect(result3).toStrictEqual(defaults);
      });

      it('should not apply offset in page mode', () => {
        const result = utils.pagination.normalise({ offset: 50 }, options);

        expect(result).not.toHaveProperty('offset');
      });
    });

    describe('cursor mode', () => {
      const defaults = { limit: 10, sortBy: 'createdAt', sortOrder: 'desc' as const, cursor: null };
      const options = { mode: 'cursor' as const, defaults };

      it('should return defaults when input is empty', () => {
        const result = utils.pagination.normalise({}, options);

        expect(result).toStrictEqual(defaults);
      });

      it('should apply cursor', () => {
        const result = utils.pagination.normalise({ cursor: 'abc123' }, options);

        expect(result).toStrictEqual({ ...defaults, cursor: 'abc123' });
      });

      it('should not apply page or offset in cursor mode', () => {
        const result = utils.pagination.normalise({ page: 5, offset: 50 }, options);

        expect(result).not.toHaveProperty('page');
        expect(result).not.toHaveProperty('offset');
      });
    });
  });

  describe('createResult', () => {
    describe('offset mode', () => {
      const query: OffsetPagination = { limit: 3, sortBy: 'createdAt', sortOrder: 'desc', offset: 0 };

      it('should create offset pagination result', () => {
        const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const result = utils.pagination.createResult(query, items, 100);

        expect(result).toStrictEqual({ total: 100, limit: 3, offset: 0, items });
      });

      it('should handle empty items', () => {
        const result = utils.pagination.createResult(query, [], 0);

        expect(result).toStrictEqual({ total: 0, limit: 3, offset: 0, items: [] });
      });

      it('should preserve offset value', () => {
        const queryWithOffset: OffsetPagination = { ...query, offset: 20 };
        const items = [{ id: 1 }];
        const result = utils.pagination.createResult(queryWithOffset, items, 50);

        expect(result.offset).toBe(20);
      });
    });

    describe('page mode', () => {
      const query: PagePagination = { limit: 3, sortBy: 'createdAt', sortOrder: 'desc', page: 1 };

      it('should create page pagination result', () => {
        const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const result = utils.pagination.createResult(query, items, 100);

        expect(result).toStrictEqual({ total: 100, limit: 3, page: 1, totalPages: 34, items });
      });

      it('should calculate totalPages correctly', () => {
        const items = [{ id: 1 }];

        const result1 = utils.pagination.createResult(query, items, 25);
        expect(result1.totalPages).toBe(9); // ceil(25/3)

        const result2 = utils.pagination.createResult(query, items, 27);
        expect(result2.totalPages).toBe(9); // ceil(27/3)

        const result3 = utils.pagination.createResult(query, items, 28);
        expect(result3.totalPages).toBe(10); // ceil(28/3)
      });

      it('should handle empty items', () => {
        const result = utils.pagination.createResult(query, [], 0);

        expect(result).toStrictEqual({ total: 0, limit: 3, page: 1, totalPages: 0, items: [] });
      });

      it('should preserve page value', () => {
        const queryWithPage: PagePagination = { ...query, page: 5 };
        const items = [{ id: 1 }];
        const result = utils.pagination.createResult(queryWithPage, items, 100);

        expect(result.page).toBe(5);
      });
    });

    describe('cursor mode', () => {
      const query: CursorPagination = { limit: 3, sortBy: 'createdAt', sortOrder: 'desc', cursor: null };
      const getCursor = (item: { id: number }) => `cursor_${item.id}`;

      it('should create cursor pagination result', () => {
        const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
        const result = utils.pagination.createResult(query, items, getCursor);

        expect(result).toStrictEqual({ limit: 3, nextCursor: 'cursor_3', items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
      });

      it('should return null nextCursor for empty items', () => {
        const result = utils.pagination.createResult(query, [], getCursor);

        expect(result).toStrictEqual({ limit: 3, nextCursor: null, items: [] });
      });

      it('should truncate items when more than limit', () => {
        const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
        const result = utils.pagination.createResult(query, items, getCursor);

        expect(result.items).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
        expect(result.nextCursor).toBe('cursor_3');
      });

      it('should return null nextCursor when items equal limit', () => {
        const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const result = utils.pagination.createResult(query, items, getCursor);

        expect(result.nextCursor).toBeNull();
      });
    });
  });
});
