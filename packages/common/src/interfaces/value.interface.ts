/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type PrimitiveValue = string | number | boolean | bigint | symbol;

export type MaybeArray<T> = T | T[];

export type MaybeNull<T> = T | null;

export type MaybeUndefined<T> = T | undefined;

export type Nullable<T> = T | null | undefined;

export type SyncValue<T = unknown> = T extends Promise<unknown> ? never : T;
