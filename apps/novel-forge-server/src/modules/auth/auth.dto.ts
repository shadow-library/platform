/**
 * Importing packages with side effects
 */

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
export class LoginQuery {
  // Relative path the browser is sent back to after the identity round-trip completes.
  @Field({ optional: true })
  returnTo?: string;
}

@Schema()
export class CallbackQuery {
  @Field({ optional: true })
  code?: string;

  @Field({ optional: true })
  state?: string;

  // OAuth error code forwarded by the identity provider when the user denies or the request fails.
  @Field({ optional: true })
  error?: string;
}

// The BINDING first-party session shape novel-forge-web consumes: flat, never a nested `user` object.
@Schema()
export class SessionResponse {
  @Field()
  userId: string;

  @Field({ optional: true })
  email?: string;

  @Field({ optional: true })
  name?: string;
}
