/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { PATTERN } from '@server/constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class RoleAssignmentBody {
  /** `ORGANISATION` mints a vendor-controlled org-wide tier grant (D-A5): principalId is the org id and the assignment is scoped to that same org. */
  @Field(() => String, { enum: ['USER', 'SERVICE_ACCOUNT', 'ORGANISATION'] })
  principalType: 'USER' | 'SERVICE_ACCOUNT' | 'ORGANISATION';

  @Field()
  principalId: string;

  @Field(() => Number)
  roleId: number;

  /** Ignored for an `ORGANISATION` grant, whose scope is derived from principalId — the server never trusts a divergent value. */
  @Field({ ...PATTERN.ID })
  organisationId: string;
}

@Schema()
export class AssignmentListQuery {
  @Field(() => String, { enum: ['USER', 'SERVICE_ACCOUNT', 'ORGANISATION'], optional: true })
  principalType?: 'USER' | 'SERVICE_ACCOUNT' | 'ORGANISATION';

  @Field({ optional: true })
  principalId?: string;

  @Field({ ...PATTERN.ID, optional: true })
  organisationId?: string;

  @Field(() => Number, { optional: true })
  roleId?: number;
}

@Schema()
export class RoleAssignmentItem {
  @Field()
  id: string;

  /** Read-only projection: it reflects any stored assignment, including the ORGANISATION principal the admin API begins minting in T-904. */
  @Field(() => String, { enum: ['USER', 'SERVICE_ACCOUNT', 'ORGANISATION'] })
  principalType: 'USER' | 'SERVICE_ACCOUNT' | 'ORGANISATION';

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
