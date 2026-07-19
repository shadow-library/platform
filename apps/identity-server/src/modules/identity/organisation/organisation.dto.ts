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
  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  organisationId: bigint;
}

@Schema()
export class MemberParams {
  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  userId: bigint;
}

@Schema()
export class InvitationParams {
  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  invitationId: bigint;
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
  @Field(() => String)
  id: bigint;

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
  @Field(() => String)
  userId: bigint;

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
  @Field(() => String)
  id: bigint;

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
  @Field(() => String)
  id: bigint;

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

@Schema()
export class DomainParams {
  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  domainId: bigint;
}

@Schema()
export class RegisterDomainBody {
  @Field({ minLength: 4, maxLength: 253 })
  domain: string;
}

@Schema()
export class DomainItem {
  @Field(() => String)
  id: bigint;

  @Field()
  domain: string;

  @Field(() => String, { enum: ['PENDING', 'VERIFIED', 'FAILED'] })
  status: 'PENDING' | 'VERIFIED' | 'FAILED';

  @Field()
  txtRecordName: string;

  @Field()
  txtRecordValue: string;

  @Field(() => String, { optional: true })
  verifiedAt?: string;

  @Field(() => String, { optional: true })
  lastCheckedAt?: string;

  @Field(() => String, { optional: true })
  lastCheckError?: string;
}

@Schema()
export class DomainsResponse {
  @Field(() => [DomainItem])
  domains: DomainItem[];
}
