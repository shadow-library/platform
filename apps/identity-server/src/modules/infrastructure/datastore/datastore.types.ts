/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface Record {
  id: bigint;
}

export type ID = string | bigint;

export type OpResult<T = Record> = T[];
