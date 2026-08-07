import { Field, Schema } from '@shadow-library/class-schema';

import { PATTERN } from '@server/constants';

@Schema()
export class GroupMappingListQuery {
  @Field({ ...PATTERN.ID, optional: true })
  organisationId?: string;

  @Field({ ...PATTERN.UUID, optional: true })
  groupId?: string;
}

@Schema()
export class CreateGroupMappingBody {
  @Field({ ...PATTERN.UUID, description: 'SCIM group whose members inherit the role; the group organisation scopes the derived assignments.' })
  groupId: string;

  @Field(() => Number)
  roleId: number;
}

@Schema()
export class GroupMappingIdParams {
  @Field({ ...PATTERN.UUID })
  mappingId: string;
}

@Schema()
export class GroupMappingItem {
  @Field()
  id: string;

  @Field()
  groupId: string;

  @Field(() => Number)
  roleId: number;

  @Field()
  organisationId: string;

  @Field(() => String, { optional: true })
  createdBy?: string;

  @Field()
  createdAt: string;
}

@Schema()
export class GroupMappingListResponse {
  @Field(() => [GroupMappingItem])
  items: GroupMappingItem[];
}
