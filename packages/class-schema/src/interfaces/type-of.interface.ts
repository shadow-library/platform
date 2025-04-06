/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { ClassSchema } from '@lib/class-schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export type TypeOf<T> = T extends ClassSchema<Class<infer U>> ? U : T extends Class<infer U> ? U : never;
