/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class AdminContextResponse {
  /** The admin permissions the caller holds in the platform organisation; empty means not staff. */
  @Field(() => [String])
  permissions: string[];
}
