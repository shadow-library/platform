import { Field, Schema } from '@shadow-library/class-schema';

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

  @Field({ optional: true })
  client_assertion_type?: string;

  @Field({ optional: true })
  client_assertion?: string;

  @Field({ optional: true, description: 'RFC 8693 subject token being delegated during token exchange.' })
  subject_token?: string;

  @Field({ optional: true, description: 'RFC 8693 type of the delegated subject token.' })
  subject_token_type?: string;

  @Field({ optional: true, description: 'RFC 8693 token type requested from the exchange.' })
  requested_token_type?: string;

  @Field({ optional: true, description: 'Accepted only to reject it; the actor is always the authenticated caller.' })
  actor_token?: string;
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

  @Field({ optional: true, description: 'RFC 8693 issued token type; present only on token-exchange responses.' })
  issued_token_type?: string;
}

@Schema()
export class TokenActionBody {
  @Field()
  token: string;

  @Field({ optional: true })
  client_id?: string;

  @Field({ optional: true })
  client_secret?: string;
}

@Schema()
export class IntrospectionResponseDto {
  @Field(() => Boolean)
  active: boolean;

  @Field({ optional: true })
  sub?: string;

  @Field({ optional: true })
  scope?: string;

  @Field({ optional: true })
  aud?: string;

  @Field(() => Number, { optional: true })
  exp?: number;

  @Field({ optional: true })
  client_id?: string;

  @Field({ optional: true })
  token_type?: string;
}

@Schema()
export class RevocationResponse {
  @Field(() => Boolean)
  revoked: boolean;
}

@Schema()
export class UserInfoResponse {
  @Field()
  sub: string;

  @Field({ optional: true, description: 'Released for every valid token without requiring the email scope for backward compatibility.' })
  email?: string;

  @Field(() => Boolean, { optional: true })
  email_verified?: boolean;

  @Field({ optional: true, description: 'Presentable name composed from the preferred display name or legal name parts.' })
  name?: string;

  @Field({ optional: true })
  given_name?: string;

  @Field({ optional: true })
  family_name?: string;

  @Field({ optional: true })
  preferred_username?: string;

  @Field({ optional: true })
  picture?: string;
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

  @Field()
  revocation_endpoint: string;

  @Field()
  introspection_endpoint: string;

  @Field(() => [String])
  token_endpoint_auth_methods_supported: string[];

  @Field(() => [String])
  scopes_supported: string[];

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

  @Field(() => Boolean)
  backchannel_logout_supported: boolean;

  @Field(() => Boolean)
  backchannel_logout_session_supported: boolean;

  @Field({ description: 'Global first-party endpoint derived by services rather than configured independently.' })
  step_up_endpoint: string;

  @Field({ description: 'Global first-party endpoint derived by services rather than configured independently.' })
  app_session_endpoint: string;
}
