import { Field, Schema } from '@shadow-library/class-schema';

import { PATTERN } from '@server/constants';

const CLIENT_KINDS = ['WEB_CONFIDENTIAL', 'SPA_PUBLIC', 'NATIVE_PUBLIC', 'SERVICE'] as const;
type ClientKind = (typeof CLIENT_KINDS)[number];

export const ALLOWED_GRANT_TYPES = ['authorization_code', 'refresh_token', 'client_credentials'] as const;

@Schema()
export class ClientIdParams {
  @Field({ ...PATTERN.CLIENT_ID })
  clientId: string;
}

@Schema()
export class ClientScopeParams {
  @Field({ ...PATTERN.CLIENT_ID })
  clientId: string;

  @Field({ ...PATTERN.UUID })
  scopeId: string;
}

@Schema()
export class RegisterClientBody {
  @Field({ ...PATTERN.CLIENT_ID, description: 'Admin-chosen immutable client identifier embedded in tokens and configuration.' })
  clientId: string;

  @Field(() => Number)
  applicationId: number;

  @Field({ maxLength: 255 })
  name: string;

  @Field(() => String, { enum: [...CLIENT_KINDS] })
  kind: ClientKind;

  @Field(() => Boolean, { optional: true })
  isFirstParty?: boolean;

  @Field(() => [String], { optional: true })
  redirectUris?: string[];

  @Field(() => [String])
  grantTypes: string[];

  @Field(() => Number, { optional: true, minimum: 60, maximum: 86400 })
  accessTokenTtl?: number;

  @Field({ optional: true, description: 'OIDC back-channel logout endpoint to which logout tokens are posted on session termination.' })
  backchannelLogoutUri?: string;

  @Field(() => [String], {
    optional: true,
    description: 'Kubernetes service-account subjects or namespace-scoped patterns allowed to authenticate this client.',
  })
  workloadSubjects?: string[];

  @Field(() => String, {
    optional: true,
    enum: ['client_secret', 'workload_identity'],
    description:
      'Confidential-client authentication method; workload_identity binds Kubernetes service accounts without a secret, while client_secret mints a rotatable secret. Ignored for public clients.',
  })
  authMethod?: 'client_secret' | 'workload_identity';
}

@Schema()
export class ClientListQuery {
  @Field(() => Number, { optional: true, description: "Restricts the listing to one application's clients." })
  applicationId?: number;
}

@Schema()
export class RegisterClientResponse {
  @Field()
  clientId: string;

  @Field(() => String, { optional: true, description: 'Client secret returned exactly once; only its Argon2id hash is stored.' })
  secret?: string;
}

@Schema()
export class ClientSummaryItem {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field(() => String, { enum: [...CLIENT_KINDS] })
  kind: ClientKind;

  @Field(() => Boolean)
  isFirstParty: boolean;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => Number)
  applicationId: number;
}

@Schema()
export class ClientListResponse {
  @Field(() => [ClientSummaryItem])
  items: ClientSummaryItem[];
}

@Schema()
export class ClientDetailResponse extends ClientSummaryItem {
  @Field(() => [String])
  redirectUris: string[];

  @Field(() => [String])
  scopes: string[];

  @Field(() => [String])
  grantTypes: string[];

  @Field(() => Number)
  accessTokenTtl: number;

  @Field(() => String, {
    enum: ['none', 'client_secret', 'workload_identity'],
    description: 'Client authentication method: none for public PKCE clients, client_secret, or workload_identity for Kubernetes service accounts.',
  })
  authMethod: 'none' | 'client_secret' | 'workload_identity';

  @Field(() => [String], { optional: true, description: 'Kubernetes service-account subjects or patterns; present only for workload_identity clients.' })
  workloadSubjects?: string[];

  @Field(() => String, { optional: true, description: 'OIDC back-channel logout endpoint to which logout tokens are posted on session termination.' })
  backchannelLogoutUri?: string;

  @Field()
  createdAt: string;
}

@Schema()
export class UpdateClientBody {
  @Field({ optional: true, maxLength: 255 })
  name?: string;

  @Field(() => Boolean, { optional: true })
  isActive?: boolean;

  @Field(() => [String], { optional: true })
  redirectUris?: string[];

  @Field({ optional: true, description: 'OIDC back-channel logout endpoint to which logout tokens are posted on session termination.' })
  backchannelLogoutUri?: string;

  @Field(() => [String], {
    optional: true,
    description: 'Replaces the full set of Kubernetes service-account subjects or patterns; pass an empty array to remove all bindings.',
  })
  workloadSubjects?: string[];
}

@Schema()
export class RotateSecretResponse {
  @Field({ description: 'Replacement client secret, shown exactly once.' })
  secret: string;

  @Field()
  previousSecretsExpireAt: string;
}

@Schema()
export class GrantScopeBody {
  @Field({ ...PATTERN.UUID })
  scopeId: string;
}

@Schema()
export class CreateResourceBody {
  @Field(() => Number)
  applicationId: number;

  @Field({ maxLength: 255 })
  identifier: string;

  @Field({ optional: true, maxLength: 255 })
  displayName?: string;
}

@Schema()
export class ResourceIdParams {
  @Field({ ...PATTERN.UUID })
  resourceId: string;
}

@Schema()
export class CreateScopeBody {
  @Field({ maxLength: 128 })
  name: string;

  @Field({ optional: true })
  description?: string;

  @Field(() => Boolean, { optional: true })
  isSensitive?: boolean;

  @Field(() => String, {
    optional: true,
    enum: ['USER', 'SERVICE', 'BOTH'],
    description: 'Principal kind that may hold this scope: USER, SERVICE for machine-to-machine access, or BOTH. Defaults to BOTH.',
  })
  principalType?: 'USER' | 'SERVICE' | 'BOTH';
}

@Schema()
export class ScopeItem {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field(() => String, { optional: true })
  description?: string;

  @Field(() => Boolean)
  isSensitive: boolean;

  @Field(() => String, {
    enum: ['USER', 'SERVICE', 'BOTH'],
    description: 'Principal kind that may hold this scope: USER, SERVICE for machine-to-machine access, or BOTH.',
  })
  principalType: 'USER' | 'SERVICE' | 'BOTH';
}

@Schema()
export class ResourceItem {
  @Field()
  id: string;

  @Field()
  identifier: string;

  @Field(() => String, { optional: true })
  displayName?: string;

  @Field(() => Number)
  applicationId: number;

  @Field(() => [ScopeItem])
  scopes: ScopeItem[];
}

@Schema()
export class ResourceListResponse {
  @Field(() => [ResourceItem])
  items: ResourceItem[];
}

@Schema()
export class CreatedResponse {
  @Field()
  id: string;
}
