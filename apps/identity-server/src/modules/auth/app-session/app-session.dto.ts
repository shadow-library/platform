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

@Schema()
export class CreateAppSessionBody {
  @Field()
  code: string;

  @Field()
  codeVerifier: string;

  @Field()
  redirectUri: string;
}

@Schema()
export class AppSessionResponse {
  /** The opaque handle. Returned once; the application sets it as a cookie on its own domain. */
  @Field()
  sessionHandle: string;

  @Field()
  userId: string;

  @Field()
  expiresAt: string;

  @Field()
  scope: string;
}

@Schema()
export class MintAppTokenBody {
  @Field()
  sessionHandle: string;

  /** RFC 8707 target API. Omitted, the token addresses the identity service itself. */
  @Field({ optional: true })
  resource?: string;

  /** Narrows the token to a subset of the session's consented scope; defaults to all of it. */
  @Field({ optional: true })
  scope?: string;

  /** Requires a step-up already granted for this exact resource. */
  @Field(() => Boolean, { optional: true })
  elevated?: boolean;
}

@Schema()
export class AppTokenResponse {
  @Field()
  accessToken: string;

  @Field()
  tokenType: string;

  @Field(() => Number)
  expiresIn: number;

  @Field()
  scope: string;

  @Field()
  audience: string;

  @Field()
  aal: string;
}

@Schema()
export class AppSessionHandleBody {
  @Field()
  sessionHandle: string;
}

@Schema()
export class ClaimElevationBody {
  @Field()
  sessionHandle: string;

  @Field({ optional: true })
  resource?: string;
}

@Schema()
export class ElevationResponse {
  @Field()
  expiresAt: string;
}

@Schema()
export class AppSessionActionResponse {
  @Field(() => Boolean)
  success: boolean;
}

/**
 * Declaring the constants
 */
