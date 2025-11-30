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

export interface PostgresError {
  errno: string;
  detail: string;
  severity: string;
  schema: string;
  table: string;
  constraint: string;
  file: string;
  routine: string;
  code: 'ERR_POSTGRES_SERVER_ERROR';
}
