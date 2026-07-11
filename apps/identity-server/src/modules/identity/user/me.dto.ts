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
export class MeResponse {
  @Field()
  userId: string;

  @Field({ optional: true })
  firstName?: string;

  @Field({ optional: true })
  lastName?: string;

  @Field({ optional: true })
  email?: string;

  @Field(() => String, { enum: ['AAL1', 'AAL2'] })
  aal: 'AAL1' | 'AAL2';

  /** True while the session sits inside its step-up elevation window. */
  @Field(() => Boolean)
  elevated: boolean;

  @Field({ optional: true })
  elevatedUntil?: string;
}
