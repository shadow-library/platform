/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export interface SchemaComposerMetadata {
  opName?: string;
  op: 'anyOf' | 'oneOf';
  classes: Class<unknown>[];
  discriminatorKey?: string;
}
