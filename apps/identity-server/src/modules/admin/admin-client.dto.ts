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

const CLIENT_KINDS = ['WEB_CONFIDENTIAL', 'SPA_PUBLIC', 'NATIVE_PUBLIC', 'SERVICE'] as const;
type ClientKind = (typeof CLIENT_KINDS)[number];

/**
 * Declaring the constants
 */

export const ALLOWED_GRANT_TYPES = ['authorization_code', 'refresh_token', 'client_credentials'] as const;

@Schema()
export class ClientIdParams {
  @Field({ pattern: '^[0-9a-fA-F-]{36}$' })
  clientId: string;
}

@Schema()
export class ClientScopeParams {
  @Field({ pattern: '^[0-9a-fA-F-]{36}$' })
  clientId: string;

  @Field({ pattern: '^[0-9a-fA-F-]{36}$' })
  scopeId: string;
}

@Schema()
export class RegisterClientBody {
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

  /** OIDC back-channel logout endpoint; logout tokens POST here on session termination. */
  @Field({ optional: true })
  backchannelLogoutUri?: string;

  /** k8s SA subject (`system:serviceaccount:<ns>:<name>`) allowed to authenticate this client with a projected token (D-16). */
  @Field({ optional: true, maxLength: 512 })
  workloadSubject?: string;

  /**
   * Confidential-client authentication method. `workload_identity` binds the k8s SA subject and
   * mints no secret; `client_secret` mints a rotatable secret. Ignored for public clients.
   */
  @Field(() => String, { optional: true, enum: ['client_secret', 'workload_identity'] })
  authMethod?: 'client_secret' | 'workload_identity';
}

@Schema()
export class ClientListQuery {
  /** Restrict the listing to a single application's clients (used by the Applications console). */
  @Field(() => Number, { optional: true })
  applicationId?: number;
}

@Schema()
export class RegisterClientResponse {
  @Field()
  clientId: string;

  /** Returned exactly once at registration; only its argon2id hash is stored. */
  @Field(() => String, { optional: true })
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

  /** How the client authenticates: `none` (public/PKCE), `client_secret`, or `workload_identity` (k8s). */
  @Field(() => String, { enum: ['none', 'client_secret', 'workload_identity'] })
  authMethod: 'none' | 'client_secret' | 'workload_identity';

  /** The bound k8s SA subject, present only for `workload_identity` clients (D-16). */
  @Field(() => String, { optional: true })
  workloadSubject?: string;

  /** OIDC back-channel logout endpoint; logout tokens POST here on session termination. */
  @Field(() => String, { optional: true })
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

  @Field({ optional: true })
  backchannelLogoutUri?: string;

  /** k8s SA subject bound to this client; pass an empty string to unbind (D-16). */
  @Field({ optional: true, maxLength: 512 })
  workloadSubject?: string;
}

@Schema()
export class RotateSecretResponse {
  /** The replacement secret, shown exactly once. */
  @Field()
  secret: string;

  @Field()
  previousSecretsExpireAt: string;
}

@Schema()
export class GrantScopeBody {
  @Field({ pattern: '^[0-9a-fA-F-]{36}$' })
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
  @Field({ pattern: '^[0-9a-fA-F-]{36}$' })
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
