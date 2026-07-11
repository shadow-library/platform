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
export class CreateRoleBody {
  @Field(() => Number)
  applicationId: number;

  @Field({ maxLength: 64 })
  roleName: string;

  @Field({ optional: true, maxLength: 255 })
  description?: string;
}

@Schema()
export class CreatePermissionBody {
  @Field(() => Number)
  applicationId: number;

  @Field({ maxLength: 128 })
  name: string;

  @Field({ optional: true, maxLength: 255 })
  description?: string;
}

@Schema()
export class RoleIdParams {
  @Field({ pattern: '^\\d+$' })
  roleId: string;
}

@Schema()
export class RolePermissionParams {
  @Field({ pattern: '^\\d+$' })
  roleId: string;

  @Field({ pattern: '^[0-9a-fA-F-]{36}$' })
  permissionId: string;
}

@Schema()
export class GrantRolePermissionBody {
  @Field({ pattern: '^[0-9a-fA-F-]{36}$' })
  permissionId: string;
}

@Schema()
export class RoleAssignmentBody {
  @Field(() => String, { enum: ['USER', 'SERVICE_ACCOUNT'] })
  principalType: 'USER' | 'SERVICE_ACCOUNT';

  @Field()
  principalId: string;

  @Field(() => Number)
  roleId: number;

  @Field({ pattern: '^\\d+$' })
  organisationId: string;
}

@Schema()
export class AssignmentListQuery {
  @Field(() => String, { enum: ['USER', 'SERVICE_ACCOUNT'], optional: true })
  principalType?: 'USER' | 'SERVICE_ACCOUNT';

  @Field({ optional: true })
  principalId?: string;

  @Field({ optional: true, pattern: '^\\d+$' })
  organisationId?: string;

  @Field(() => Number, { optional: true })
  roleId?: number;
}

@Schema()
export class RoleAssignmentItem {
  @Field()
  id: string;

  @Field(() => String, { enum: ['USER', 'SERVICE_ACCOUNT'] })
  principalType: 'USER' | 'SERVICE_ACCOUNT';

  @Field()
  principalId: string;

  @Field(() => Number)
  roleId: number;

  @Field()
  organisationId: string;

  @Field(() => String, { optional: true })
  grantedBy?: string;

  @Field()
  grantedAt: string;
}

@Schema()
export class AssignmentListResponse {
  @Field(() => [RoleAssignmentItem])
  items: RoleAssignmentItem[];
}

@Schema()
export class PermissionItem {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field(() => String, { optional: true })
  description?: string;
}

@Schema()
export class PermissionListResponse {
  @Field(() => [PermissionItem])
  items: PermissionItem[];
}

@Schema()
export class ApplicationIdQuery {
  @Field(() => Number)
  applicationId: number;
}
