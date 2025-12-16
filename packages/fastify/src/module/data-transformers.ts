/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { InbuiltTransformers } from '@lib/decorators';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const INBUILT_TRANSFORMERS: InbuiltTransformers = {
  'email:normalize': value => value.trim().toLowerCase(),
  'string:trim': value => value.trim(),

  'int:parse': value => parseInt(value, 10),
  'float:parse': value => parseFloat(value),
  'bigint:parse': value => BigInt(value),
};
