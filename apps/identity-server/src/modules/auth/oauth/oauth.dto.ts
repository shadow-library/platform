/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * These DTOs mirror the OAuth 2.0 / OIDC wire format, so their property names are snake_case by
 * design rather than the project's usual camelCase.
 */

@Schema()
export class AuthorizeQuery {
  @Field()
  client_id: string;

  @Field()
  redirect_uri: string;

  @Field()
  response_type: string;

  @Field({ optional: true })
  scope?: string;

  @Field({ optional: true })
  state?: string;

  @Field({ optional: true })
  nonce?: string;

  @Field({ optional: true })
  code_challenge?: string;

  @Field({ optional: true })
  code_challenge_method?: string;

  @Field({ optional: true })
  resource?: string;
}

@Schema()
export class TokenRequestBody {
  @Field()
  grant_type: string;

  @Field({ optional: true })
  code?: string;

  @Field({ optional: true })
  redirect_uri?: string;

  @Field({ optional: true })
  code_verifier?: string;

  @Field({ optional: true })
  refresh_token?: string;

  @Field({ optional: true })
  scope?: string;

  @Field({ optional: true })
  resource?: string;

  @Field({ optional: true })
  client_id?: string;

  @Field({ optional: true })
  client_secret?: string;
}

@Schema()
export class TokenResponse {
  @Field()
  access_token: string;

  @Field()
  token_type: string;

  @Field(() => Number)
  expires_in: number;

  @Field()
  scope: string;

  @Field({ optional: true })
  id_token?: string;

  @Field({ optional: true })
  refresh_token?: string;
}

@Schema()
export class UserInfoResponse {
  @Field()
  sub: string;

  @Field({ optional: true })
  email?: string;

  @Field(() => Boolean, { optional: true })
  email_verified?: boolean;
}

@Schema()
export class DiscoveryResponse {
  @Field()
  issuer: string;

  @Field()
  authorization_endpoint: string;

  @Field()
  token_endpoint: string;

  @Field()
  userinfo_endpoint: string;

  @Field()
  jwks_uri: string;

  @Field(() => [String])
  response_types_supported: string[];

  @Field(() => [String])
  grant_types_supported: string[];

  @Field(() => [String])
  subject_types_supported: string[];

  @Field(() => [String])
  id_token_signing_alg_values_supported: string[];

  @Field(() => [String])
  code_challenge_methods_supported: string[];
}
