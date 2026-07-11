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

const ORG_TYPES = ['PERSONAL', 'TEAM'] as const;
const ORG_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
const MEMBER_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
const INVITABLE_ROLES = ['ADMIN', 'MEMBER'] as const;

type OrgType = (typeof ORG_TYPES)[number];
type OrgStatus = (typeof ORG_STATUSES)[number];
type MemberRole = (typeof MEMBER_ROLES)[number];
type InvitableRole = (typeof INVITABLE_ROLES)[number];

/**
 * Declaring the constants
 */

@Schema()
export class OrganisationIdParams {
  @Field({ pattern: '^\\d+$' })
  organisationId: string;
}

@Schema()
export class MemberParams {
  @Field({ pattern: '^\\d+$' })
  organisationId: string;

  @Field({ pattern: '^\\d+$' })
  userId: string;
}

@Schema()
export class InvitationParams {
  @Field({ pattern: '^\\d+$' })
  organisationId: string;

  @Field({ pattern: '^\\d+$' })
  invitationId: string;
}

@Schema()
export class CreateOrganisationBody {
  @Field({ minLength: 1, maxLength: 255 })
  name: string;

  @Field(() => String, { optional: true, pattern: '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$' })
  slug?: string;
}

@Schema()
export class RenameOrganisationBody {
  @Field({ minLength: 1, maxLength: 255 })
  name: string;
}

@Schema()
export class OrganisationResponse {
  @Field()
  id: string;

  @Field()
  slug: string;

  @Field()
  name: string;

  @Field(() => String, { enum: [...ORG_TYPES] })
  type: OrgType;

  @Field(() => String, { enum: [...ORG_STATUSES] })
  status: OrgStatus;

  @Field()
  createdAt: string;
}

@Schema()
export class MemberItem {
  @Field()
  userId: string;

  @Field(() => String, { enum: [...MEMBER_ROLES] })
  role: MemberRole;

  @Field(() => String, { optional: true })
  email?: string;

  @Field()
  joinedAt: string;
}

@Schema()
export class MembersResponse {
  @Field(() => [MemberItem])
  members: MemberItem[];
}

@Schema()
export class UpdateMemberRoleBody {
  @Field(() => String, { enum: [...MEMBER_ROLES] })
  role: MemberRole;
}

@Schema()
export class InviteMemberBody {
  @Field({ pattern: '^[^@\\s]+@[^@\\s]+[.][^@\\s]+$' })
  email: string;

  @Field(() => String, { enum: [...INVITABLE_ROLES] })
  role: InvitableRole;
}

@Schema()
export class InvitationItem {
  @Field()
  id: string;

  @Field()
  email: string;

  @Field(() => String, { enum: [...MEMBER_ROLES] })
  role: MemberRole;

  @Field()
  expiresAt: string;

  @Field()
  createdAt: string;
}

@Schema()
export class InvitationsResponse {
  @Field(() => [InvitationItem])
  invitations: InvitationItem[];
}

@Schema()
export class InvitationTokenBody {
  @Field({ minLength: 16, maxLength: 128 })
  token: string;
}

@Schema()
export class OrganisationActionResponse {
  @Field(() => Boolean)
  success: boolean;
}

@Schema()
export class MyOrganisationItem {
  @Field()
  id: string;

  @Field()
  slug: string;

  @Field()
  name: string;

  @Field(() => String, { enum: [...ORG_TYPES] })
  type: OrgType;

  @Field(() => String, { enum: [...ORG_STATUSES] })
  status: OrgStatus;

  @Field(() => String, { enum: [...MEMBER_ROLES] })
  role: MemberRole;

  @Field(() => Boolean)
  isDefault: boolean;

  @Field()
  joinedAt: string;
}

@Schema()
export class MyOrganisationsResponse {
  @Field(() => [MyOrganisationItem])
  organisations: MyOrganisationItem[];
}
