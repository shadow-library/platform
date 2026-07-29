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
 *
 * The query and body shapes keep their wire names: `return_to`, `logout_token` and the OAuth error
 * parameters are spelled by their specifications, and renaming them here would only hide which
 * parameter a failure is actually about. Every query schema stays open to additional properties so a
 * future identity release can add one without this SDK rejecting the callback.
 */

@Schema({ additionalProperties: true })
export class AuthLoginQuery {
  /** Where to land once the login completes; validated against the redirect allow-list, never trusted */
  @Field({ optional: true })
  return_to?: string;
}

@Schema({ additionalProperties: true })
export class AuthCallbackQuery {
  @Field({ optional: true })
  code?: string;

  @Field({ optional: true })
  state?: string;

  /** Present instead of `code` when the user declined or identity refused the request */
  @Field({ optional: true })
  error?: string;

  @Field({ optional: true })
  error_description?: string;
}

@Schema({ additionalProperties: true })
export class AuthStepUpQuery {
  @Field({ optional: true })
  return_to?: string;

  /** Set on the way back from identity, so a step-up that still cannot be claimed fails instead of looping */
  @Field({ optional: true })
  claimed?: string;

  /** Set after a prompt was restarted for an intent mismatch, so a second mismatch fails instead of looping */
  @Field({ optional: true })
  retried?: string;
}

@Schema()
export class BackchannelLogoutBody {
  @Field()
  logout_token: string;
}

@Schema()
export class AuthSessionResponse {
  @Field()
  sub: string;

  @Field(() => [String])
  scopes: string[];

  @Field({ optional: true })
  org?: string;

  /** `AAL2` only while a step-up grant for this application's audience is live */
  @Field({ optional: true })
  aal?: string;

  @Field({ optional: true })
  clientId?: string;
}

@Schema()
export class AuthLogoutResponse {
  @Field()
  success: boolean;

  /** Set when identity's RP-initiated logout should be visited next */
  @Field({ optional: true })
  redirectTo?: string;
}

@Schema()
export class BackchannelLogoutResponse {
  @Field()
  success: boolean;
}

@Schema()
export class AuthOrganisationItem {
  @Field()
  id: string;

  @Field()
  slug: string;

  @Field()
  name: string;

  @Field(() => String, { enum: ['PERSONAL', 'TEAM'] })
  type: 'PERSONAL' | 'TEAM';

  /** Whether the session is acting in this organisation right now */
  @Field()
  active: boolean;
}

@Schema()
export class AuthOrganisationsResponse {
  @Field(() => [AuthOrganisationItem])
  organisations: AuthOrganisationItem[];
}

@Schema()
export class SwitchOrganisationBody {
  @Field()
  organisationId: string;
}

@Schema()
export class SwitchOrganisationResponse {
  @Field()
  organisationId: string;
}
