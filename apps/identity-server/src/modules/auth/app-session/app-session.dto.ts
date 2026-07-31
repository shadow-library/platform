/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { PATTERN } from '@server/constants';

/**
 * Defining types
 */

const ORGANISATION_TYPES = ['PERSONAL', 'TEAM'] as const;

type OrganisationType = (typeof ORGANISATION_TYPES)[number];

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

@Schema()
export class AppSessionOrganisationItem {
  @Field(() => String)
  id: bigint;

  @Field()
  slug: string;

  @Field()
  name: string;

  @Field(() => String, { enum: [...ORGANISATION_TYPES] })
  type: OrganisationType;

  /** Whether the session is acting in this organisation right now. */
  @Field(() => Boolean)
  active: boolean;
}

@Schema()
export class AppSessionOrganisationsResponse {
  @Field(() => [AppSessionOrganisationItem])
  organisations: AppSessionOrganisationItem[];
}

@Schema()
export class SwitchOrganisationBody {
  @Field()
  sessionHandle: string;

  @Field({ ...PATTERN.ID })
  organisationId: string;
}

@Schema()
export class SwitchOrganisationResponse {
  /**
   * The rotated handle. Switching organisation issues a new one and retires the old, so the caller must
   * replace its stored handle — the previous value is dead the moment this returns.
   */
  @Field()
  sessionHandle: string;

  @Field()
  organisationId: string;

  @Field()
  expiresAt: string;
}

/**
 * Declaring the constants
 */
