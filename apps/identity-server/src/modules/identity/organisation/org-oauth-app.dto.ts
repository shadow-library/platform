import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { PATTERN } from '@server/constants';

const ORG_CLIENT_KINDS = ['WEB_CONFIDENTIAL', 'SPA_PUBLIC', 'NATIVE_PUBLIC'] as const;

type OrgClientKind = (typeof ORG_CLIENT_KINDS)[number];

@Schema()
export class OrgOAuthAppParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { ...PATTERN.ID })
  @Transform('int:parse')
  applicationId: number;
}

@Schema()
export class OrgOAuthAppScopeParams extends OrgOAuthAppParams {
  @Field({ ...PATTERN.UUID })
  scopeId: string;
}

@Schema()
export class RegisterOrgOAuthAppBody {
  @Field({ minLength: 1, maxLength: 255, description: 'Name shown to members on the consent screen and in their connected-apps list.' })
  displayName: string;

  @Field(() => String, {
    enum: [...ORG_CLIENT_KINDS],
    description: 'WEB_CONFIDENTIAL issues a client secret; SPA_PUBLIC and NATIVE_PUBLIC are secretless PKCE clients.',
  })
  kind: OrgClientKind;

  @Field(() => [String], {
    minItems: 1,
    maxItems: 10,
    description: 'Exact redirect URIs. https only, except http://localhost or http://127.0.0.1 for public clients and a custom scheme for NATIVE_PUBLIC. Wildcards are rejected.',
  })
  redirectUris: string[];

  @Field({ optional: true, minLength: 1, maxLength: 2048, description: 'Public landing page for the app; must be an https URL.' })
  homePageUrl?: string;

  @Field({ optional: true, minLength: 1, maxLength: 2048, description: 'Icon shown on the consent screen; must be an https URL.' })
  logoUrl?: string;

  @Field(() => Boolean, { optional: true, description: 'Grants the refresh_token grant so the app can keep access while the member is away.' })
  offlineAccess?: boolean;
}

@Schema()
export class UpdateOrgOAuthAppBody {
  @Field({ optional: true, minLength: 1, maxLength: 255 })
  displayName?: string;

  @Field({ optional: true, minLength: 1, maxLength: 2048, description: 'Public landing page for the app; must be an https URL.' })
  homePageUrl?: string;

  @Field({ optional: true, minLength: 1, maxLength: 2048, description: 'Icon shown on the consent screen; must be an https URL.' })
  logoUrl?: string;

  @Field(() => [String], { optional: true, minItems: 1, maxItems: 10, description: 'Replaces the full redirect URI set; the same scheme rules as registration apply.' })
  redirectUris?: string[];

  @Field(() => Boolean, { optional: true, description: 'Deactivating stops the app from being granted to members at the authorization endpoint.' })
  isActive?: boolean;
}

@Schema()
export class GrantOrgOAuthAppScopeBody {
  @Field({ ...PATTERN.UUID, description: 'Scope from the organisation scope catalog; anything outside it is rejected.' })
  scopeId: string;
}

@Schema()
export class RegisterOrgOAuthAppResponse {
  @Field(() => Number)
  applicationId: number;

  @Field()
  clientId: string;

  @Field(() => String, { optional: true, description: 'Client secret returned exactly once; only its Argon2id hash is stored.' })
  clientSecret?: string;
}

@Schema()
export class OrgOAuthAppItem {
  @Field(() => Number)
  applicationId: number;

  @Field()
  clientId: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  displayName?: string;

  @Field(() => Boolean)
  isActive: boolean;

  @Field()
  createdAt: string;
}

@Schema()
export class OrgOAuthAppsResponse {
  @Field(() => [OrgOAuthAppItem])
  apps: OrgOAuthAppItem[];
}

@Schema()
export class OrgOAuthAppDetailResponse extends OrgOAuthAppItem {
  @Field(() => String, { enum: [...ORG_CLIENT_KINDS] })
  kind: OrgClientKind;

  @Field(() => [String])
  redirectUris: string[];

  @Field(() => [String], { description: 'Scope names granted to the client, in addition to the OIDC protocol scopes every client may request.' })
  scopes: string[];

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  homePageUrl?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  logoUrl?: string;
}

@Schema()
export class OrgOAuthAppScopeItem {
  @Field()
  scopeId: string;

  @Field()
  name: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  description?: string;

  @Field({ description: 'Audience the scope belongs to; the app must request it as the resource indicator.' })
  resourceIdentifier: string;

  @Field(() => String, { optional: true, description: 'Display name of the platform application that owns the scope.' })
  @Transform('strip:null')
  applicationDisplayName?: string;
}

@Schema()
export class OrgOAuthAppScopeCatalogResponse {
  @Field(() => [OrgOAuthAppScopeItem])
  scopes: OrgOAuthAppScopeItem[];
}

@Schema()
export class RotateOrgOAuthAppSecretResponse {
  @Field({ description: 'Replacement client secret, shown exactly once.' })
  secret: string;

  @Field({ description: 'Moment the superseded secrets stop being accepted, leaving an overlap window to roll the change out.' })
  previousSecretsExpireAt: string;
}
