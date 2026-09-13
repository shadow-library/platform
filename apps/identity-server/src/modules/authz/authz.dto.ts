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
export class CatalogRoleBotGrant {
  @Field({ minLength: 1, maxLength: 64, description: 'Resource an organisation admin sees the grant under, such as `projects`. Unique per level within the application.' })
  resource: string;

  @Field(() => String, { enum: ['read', 'write'], description: '`write` implies `read`: a write role must carry every permission of the read role on the same resource.' })
  level: 'read' | 'write';

  @Field(() => Boolean, { optional: true, description: 'Flags the grant as sensitive to organisation admins, as for spend-incurring actions. Defaults to false.' })
  sensitive?: boolean;
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

  @Field(() => CatalogRoleBotGrant, {
    optional: true,
    description:
      'Makes the role grantable to organisation bots. Sensitivity belongs to this block, not to the role: omitting the block on a later sync revokes bot grantability and resets the resource, level and sensitivity together. A role carrying no permissions may not declare one.',
  })
  bot?: CatalogRoleBotGrant;
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
