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
  @Field(() => String, { optional: true })
  returnTo?: string;
}

@Schema()
export class CallbackQuery {
  @Field(() => String, { optional: true })
  code?: string;

  @Field(() => String, { optional: true })
  state?: string;

  @Field(() => String, { optional: true })
  error?: string;
}

/**
 * BINDING contract with webnovel-web: a flat object with a valid session, a plain 401 without —
 * never a 200 with a null user.
 */
@Schema()
export class SessionResponse {
  @Field()
  userId: string;

  @Field(() => String, { optional: true })
  email?: string;

  @Field(() => String, { optional: true })
  name?: string;
}
