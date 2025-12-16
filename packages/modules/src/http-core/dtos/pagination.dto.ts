/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Field, Schema } from '@shadow-library/class-schema';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type SortOrder = 'asc' | 'desc';

export interface IPagination<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

export interface IPaginationQuery<T extends string = string> {
  limit: number;
  offset: number;
  sortOrder: SortOrder;
  sortBy: T;
}

/**
 * Declaring the constants
 */

export function Paginated<T>(Item: Class<T>): Class<IPagination<T>> {
  @Schema()
  class Pagination implements IPagination<T> {
    @Field()
    total: number;

    @Field()
    limit: number;

    @Field()
    offset: number;

    @Field(() => [Item])
    items: T[];
  }

  Object.defineProperty(Pagination, 'name', { value: `Paginated(${Item.name})` });
  return Pagination;
}

export function PaginationQuery<T extends string>(sortBy: T[], defaults: Partial<IPaginationQuery<T>> = {}): Class<IPaginationQuery<T>> {
  assert(sortBy.length > 0, 'sortBy must have at least one value');

  @Schema()
  class PaginationQuery implements IPaginationQuery<T> {
    @Field({ default: defaults.limit ?? 20, minimum: 1, maximum: 100 })
    limit: number;

    @Field({ default: defaults.offset ?? 0, minimum: 0 })
    offset: number;

    @Field({ default: defaults.sortOrder ?? 'asc', enum: ['asc', 'desc'] })
    sortOrder: SortOrder;

    @Field({ default: defaults.sortBy ?? sortBy[0], enum: sortBy })
    sortBy: T;
  }

  return PaginationQuery;
}
