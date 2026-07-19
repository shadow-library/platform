/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class IdentityProviderParams {
  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field()
  identityProviderId: string;
}

@Schema()
export class OrganisationIdOnlyParams {
  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  organisationId: bigint;
}

@Schema()
export class CreateIdentityProviderBody {
  @Field({ minLength: 1, maxLength: 255 })
  name: string;

  @Field({ maxLength: 2048 })
  issuer: string;

  @Field({ minLength: 1, maxLength: 512 })
  clientId: string;

  @Field({ minLength: 1, maxLength: 1024 })
  clientSecret: string;

  @Field({ optional: true, maxLength: 255 })
  scopes?: string;

  @Field({ optional: true })
  enforced?: boolean;
}

@Schema()
export class UpdateIdentityProviderBody {
  @Field({ optional: true, minLength: 1, maxLength: 255 })
  name?: string;

  @Field({ optional: true, minLength: 1, maxLength: 512 })
  clientId?: string;

  @Field({ optional: true, minLength: 1, maxLength: 1024 })
  clientSecret?: string;

  @Field({ optional: true, maxLength: 255 })
  scopes?: string;

  @Field({ optional: true })
  enforced?: boolean;

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class IdentityProviderResponse {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  issuer: string;

  @Field()
  clientId: string;

  @Field()
  scopes: string;

  @Field()
  enforced: boolean;

  @Field()
  isActive: boolean;

  @Field()
  createdAt: string;
}

@Schema()
export class IdentityProviderListResponse {
  @Field(() => [IdentityProviderResponse])
  items: IdentityProviderResponse[];
}

@Schema()
export class FederatedCallbackQuery {
  @Field({ optional: true })
  state?: string;

  @Field({ optional: true })
  code?: string;

  @Field({ optional: true })
  error?: string;
}
