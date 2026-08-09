import { Field, Schema } from '@shadow-library/class-schema';

import { type SocialProviderKind } from '@server/modules/auth/federation';

@Schema()
export class SocialProviderParams {
  @Field(() => String, { enum: ['GOOGLE', 'MICROSOFT'] })
  provider: SocialProviderKind;
}

@Schema()
export class FlowIdParams {
  @Field()
  flowId: string;
}

@Schema()
export class SocialLoginStartBody {
  @Field({ optional: true })
  deviceId?: string;

  @Field({ optional: true, maxLength: 2048, description: 'Post-login destination; must be a relative path or a URL on this origin.' })
  returnTo?: string;
}

@Schema()
export class SocialLoginStartResponse {
  @Field()
  flowId: string;

  @Field({ description: 'Upstream authorization endpoint the browser must be sent to; it already carries state, nonce and the PKCE challenge.' })
  authorizationUrl: string;
}

@Schema()
export class SocialProviderOptionDto {
  @Field(() => String, { enum: ['GOOGLE', 'MICROSOFT'] })
  provider: SocialProviderKind;

  @Field()
  label: string;
}

@Schema()
export class AuthMethodsResponse {
  @Field()
  password: boolean;

  @Field()
  passkey: boolean;

  @Field()
  emailOtp: boolean;

  @Field()
  smsOtp: boolean;

  @Field(() => [SocialProviderOptionDto], { description: 'Social providers an operator has configured and enabled; render one sign-in button per entry.' })
  social: SocialProviderOptionDto[];
}
