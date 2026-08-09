import { Field, Schema } from '@shadow-library/class-schema';

import { AUTH_MODES, type AuthMode } from '@server/modules/system/auth-mode';

export type SocialProviderKindValue = 'GOOGLE' | 'MICROSOFT';

@Schema()
export class AuthModeParams {
  @Field(() => String, { enum: AUTH_MODES })
  method: AuthMode;
}

@Schema()
export class IdentityProviderIdParams {
  @Field()
  identityProviderId: string;
}

@Schema()
export class SetAuthModeBody {
  @Field({ description: 'Whether members may use this sign-in method. A social method must be configured before it can be turned on.' })
  enabled: boolean;
}

@Schema()
export class GlobalIdentityProviderItem {
  @Field()
  id: string;

  @Field(() => String, { enum: ['GOOGLE', 'MICROSOFT'] })
  kind: SocialProviderKindValue;

  @Field()
  name: string;

  @Field()
  issuer: string;

  @Field()
  clientId: string;

  @Field()
  scopes: string;

  @Field()
  allowSignUp: boolean;

  @Field()
  isActive: boolean;

  @Field()
  createdAt: string;
}

@Schema()
export class AuthModeItem {
  @Field(() => String, { enum: AUTH_MODES })
  method: AuthMode;

  @Field()
  label: string;

  @Field()
  description: string;

  @Field(() => String, { enum: ['BUILT_IN', 'SOCIAL'] })
  kind: 'BUILT_IN' | 'SOCIAL';

  @Field()
  enabled: boolean;

  @Field({ description: 'False when a social method still needs its upstream client id and secret; enabling it before then is refused.' })
  configured: boolean;

  @Field(() => GlobalIdentityProviderItem, { optional: true })
  provider?: GlobalIdentityProviderItem;
}

@Schema()
export class AuthModeListResponse {
  @Field(() => [AuthModeItem])
  items: AuthModeItem[];
}

@Schema()
export class GlobalIdentityProviderListResponse {
  @Field(() => [GlobalIdentityProviderItem])
  items: GlobalIdentityProviderItem[];
}

@Schema()
export class CreateGlobalIdentityProviderBody {
  @Field(() => String, { enum: ['GOOGLE', 'MICROSOFT'] })
  kind: SocialProviderKindValue;

  @Field({ minLength: 1, maxLength: 255 })
  name: string;

  @Field({
    maxLength: 2048,
    description:
      'Issuer url whose discovery document is fetched. Google is https://accounts.google.com; Microsoft must be a single tenant, https://login.microsoftonline.com/<tenant-id>/v2.0.',
  })
  issuer: string;

  @Field({ minLength: 1, maxLength: 512 })
  clientId: string;

  @Field({ minLength: 1, maxLength: 1024 })
  clientSecret: string;

  @Field({ optional: true, maxLength: 255 })
  scopes?: string;

  @Field({ optional: true, description: 'Whether an upstream account with no local match may create one. Turn it off to make the provider link-only.' })
  allowSignUp?: boolean;
}

@Schema()
export class UpdateGlobalIdentityProviderBody {
  @Field({ optional: true, minLength: 1, maxLength: 255 })
  name?: string;

  @Field({ optional: true, minLength: 1, maxLength: 512 })
  clientId?: string;

  @Field({ optional: true, minLength: 1, maxLength: 1024, description: 'Omit to keep the stored secret; it is never returned.' })
  clientSecret?: string;

  @Field({ optional: true, maxLength: 255 })
  scopes?: string;

  @Field({ optional: true })
  allowSignUp?: boolean;

  @Field({ optional: true })
  isActive?: boolean;
}
