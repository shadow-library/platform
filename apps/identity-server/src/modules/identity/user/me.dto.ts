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
  @Field(() => String)
  userId: bigint;

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

@Schema()
export class UpdateProfileBody {
  @Field({ optional: true, minLength: 1, maxLength: 255 })
  firstName?: string;

  @Field({ optional: true, minLength: 1, maxLength: 255 })
  lastName?: string;
}

@Schema()
export class ChangePasswordBody {
  /** Re-proves the account before the credential is rotated; a session cookie alone must not change a password. */
  @Field()
  currentPassword: string;

  @Field()
  newPassword: string;
}

@Schema()
export class ChangePasswordResponse {
  @Field(() => Boolean)
  success: boolean;
}
