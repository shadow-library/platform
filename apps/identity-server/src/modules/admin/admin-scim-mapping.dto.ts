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
export class GroupMappingListQuery {
  @Field({ ...PATTERN.ID, optional: true })
  organisationId?: string;

  @Field({ ...PATTERN.UUID, optional: true })
  groupId?: string;
}

@Schema()
export class CreateGroupMappingBody {
  /** The SCIM group whose members inherit the role; its organisation scopes the derived assignments. */
  @Field({ ...PATTERN.UUID })
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
