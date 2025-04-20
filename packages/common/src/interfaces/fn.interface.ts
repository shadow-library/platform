/**
 * Importing npm packages
 */
import { Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export type Fn<T = any, U = any> = (...args: U[]) => Promisable<T>;

export type SyncFn<T = any> = (...args: any[]) => T;

export type AsyncFn<T = any> = (...args: any[]) => Promise<T>;
