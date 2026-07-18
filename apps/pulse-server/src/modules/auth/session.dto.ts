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
  /** Application path to land on after the OIDC round-trip; absolute URLs are rejected to prevent open redirects */
  @Field({ optional: true })
  returnTo?: string;
}

@Schema()
export class LoginCallbackQuery {
  @Field()
  code: string;

  @Field()
  state: string;
}

/** BINDING CONTRACT with pulse-web: a flat session descriptor, 200 with a valid session cookie and 401 otherwise — never a 200 with a null body */
@Schema()
export class SessionResponse {
  @Field()
  userId: string;

  @Field({ optional: true })
  email?: string;

  @Field({ optional: true })
  name?: string;
}
