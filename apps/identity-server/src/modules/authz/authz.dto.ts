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
 */

@Schema()
export class CheckRequestBody {
  @Field(() => String, { enum: ['USER', 'SERVICE_ACCOUNT'] })
  principalType: 'USER' | 'SERVICE_ACCOUNT';

  @Field()
  principalId: string;

  @Field()
  organisationId: string;

  @Field()
  action: string;
}

@Schema()
export class CheckResponse {
  @Field(() => String, { enum: ['PERMIT', 'DENY'] })
  decision: 'PERMIT' | 'DENY';

  @Field(() => [String])
  reasons: string[];

  @Field(() => Number)
  authzVersion: number;
}

@Schema()
export class CatalogPermission {
  @Field({ maxLength: 128 })
  name: string;

  @Field({ optional: true, maxLength: 255 })
  description?: string;
}

@Schema()
export class CatalogRole {
  @Field({ maxLength: 255 })
  name: string;

  @Field({ optional: true, maxLength: 255 })
  description?: string;

  /** Names of permissions this role carries; every name MUST also appear in `permissions` */
  @Field(() => [String])
  permissions: string[];
}

@Schema()
export class CatalogSyncBody {
  @Field(() => [CatalogPermission])
  permissions: CatalogPermission[];

  @Field(() => [CatalogRole])
  roles: CatalogRole[];
}

@Schema()
export class CatalogSyncResponse {
  @Field(() => Number)
  permissionsUpserted: number;

  @Field(() => Number)
  permissionsDeleted: number;

  @Field(() => Number)
  rolesUpserted: number;

  @Field(() => Number)
  rolesDeleted: number;

  @Field(() => Number)
  principalsInvalidated: number;
}
