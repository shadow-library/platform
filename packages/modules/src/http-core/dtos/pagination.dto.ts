/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type SortOrder = 'ASC' | 'DESC';

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
  @Schema()
  class PaginationQuery implements IPaginationQuery<T> {
    @Field({ default: defaults.limit ?? 20 })
    limit: number;

    @Field({ default: defaults.offset ?? 0 })
    offset: number;

    @Field({ default: defaults.sortOrder ?? 'ASC' })
    sortOrder: SortOrder;

    @Field({ default: defaults.sortBy ?? sortBy[0] })
    sortBy: T;
  }

  return PaginationQuery;
}
