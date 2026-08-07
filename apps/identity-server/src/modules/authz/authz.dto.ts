import { Field, Schema } from '@shadow-library/class-schema';

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

  @Field(() => [String], { description: 'Permission names carried by this role; each name must also appear in the catalog permissions.' })
  permissions: string[];

  @Field(() => Boolean, {
    optional: true,
    description: 'When true, every signed-in application user implicitly holds this role without an assignment.',
  })
  default?: boolean;
}

@Schema()
export class CatalogSyncBody {
  @Field(() => [CatalogPermission])
  permissions: CatalogPermission[];

  @Field(() => [CatalogRole])
  roles: CatalogRole[];

  @Field(() => Boolean, { optional: true, description: 'Overrides the guardrail that rejects a manifest deleting more than half of the catalog.' })
  force?: boolean;
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

@Schema()
export class ServiceAccessRuleDto {
  @Field()
  callerClientId: string;

  @Field()
  method: string;

  @Field()
  path: string;
}

@Schema()
export class ServiceAccessResponse {
  @Field(() => [ServiceAccessRuleDto])
  rules: ServiceAccessRuleDto[];
}
