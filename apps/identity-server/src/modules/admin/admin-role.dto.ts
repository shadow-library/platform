import { Field, Schema } from '@shadow-library/class-schema';

import { PATTERN } from '@server/constants';

@Schema()
export class RoleAssignmentBody {
  @Field(() => String, {
    enum: ['USER', 'SERVICE_ACCOUNT', 'ORGANISATION'],
    description: 'ORGANISATION creates an organisation-wide tier grant whose principal and assignment scope are the same organisation.',
  })
  principalType: 'USER' | 'SERVICE_ACCOUNT' | 'ORGANISATION';

  @Field()
  principalId: string;

  @Field(() => Number)
  roleId: number;

  @Field({ ...PATTERN.ID, description: 'Ignored for ORGANISATION grants, whose scope is derived from principalId.' })
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

  @Field(() => String, {
    enum: ['USER', 'SERVICE_ACCOUNT', 'ORGANISATION'],
    description: 'Read-only projection of the stored assignment, including organisation principals.',
  })
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
