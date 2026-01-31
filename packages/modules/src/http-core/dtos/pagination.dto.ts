/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { EnumType, Field, Schema } from '@shadow-library/class-schema';
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

const SortOrder = EnumType.create<SortOrder>('SortOrder', ['asc', 'desc']);

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

export function PaginationQuery<T extends string>(SortBy: EnumType<T>, defaults: Partial<IPaginationQuery<T>> = {}): Class<IPaginationQuery<T>> {
  assert(SortBy.values.length > 0, 'sortBy must have at least one value');

  @Schema()
  class PaginationQuery implements IPaginationQuery<T> {
    @Field({ default: defaults.limit ?? 20, minimum: 1, maximum: 100 })
    limit: number;

    @Field({ default: defaults.offset ?? 0, minimum: 0 })
    offset: number;

    @Field(() => SortOrder, { default: defaults.sortOrder ?? 'asc' })
    sortOrder: SortOrder;

    @Field(() => SortBy, { default: defaults.sortBy ?? SortBy.values[0] })
    sortBy: T;
  }

  return PaginationQuery;
}
