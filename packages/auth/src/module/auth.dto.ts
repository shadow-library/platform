import { Field, Schema } from '@shadow-library/class-schema';

import { type AuthAccessMode } from '../interfaces';

// Wire names (`return_to`, `logout_token`, OAuth error parameters) are spelled by their specifications; query schemas stay open so a future identity release can add a
// parameter without the callback being rejected.

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

/**
 * OIDC claim names are passed through as spelled; everything but `sub` can be missing (an unfilled profile, or a session predating the `profile` scope), so consumers must
 * render a fallback
 */
@Schema()
export class AuthUserInfoResponse {
  @Field()
  sub: string;

  /** The one presentable string: a chosen display name, else the name parts joined */
  @Field({ optional: true })
  name?: string;

  @Field({ optional: true })
  given_name?: string;

  @Field({ optional: true })
  family_name?: string;

  @Field({ optional: true })
  preferred_username?: string;

  @Field({ optional: true })
  picture?: string;

  @Field({ optional: true })
  email?: string;

  @Field(() => Boolean, { optional: true })
  email_verified?: boolean;
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

@Schema()
export class AuthAccessResponse {
  @Field(() => String, {
    enum: ['public', 'private'],
    description:
      "Whether this application serves anyone without a session. 'private' means every page needs a signed-in user, so a client sends an anonymous visitor to login before rendering.",
  })
  mode: AuthAccessMode;
}
