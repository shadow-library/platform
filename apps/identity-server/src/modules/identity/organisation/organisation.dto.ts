/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { PATTERN } from '@server/constants';

/**
 * Defining types
 */

const ORG_TYPES = ['PERSONAL', 'TEAM'] as const;
const ORG_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
const MEMBER_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
const INVITABLE_ROLES = ['ADMIN', 'MEMBER'] as const;
const MEMBER_STATUSES = ['ACTIVE', 'SUSPENDED', 'BLOCKED'] as const;
const APP_ACCESS_MODES = ['ALL_APPS', 'ASSIGNED_ONLY'] as const;
const APPLICATION_VISIBILITY = ['PUBLIC', 'RESTRICTED', 'INTERNAL'] as const;

type OrgType = (typeof ORG_TYPES)[number];
type OrgStatus = (typeof ORG_STATUSES)[number];
type MemberRole = (typeof MEMBER_ROLES)[number];
type InvitableRole = (typeof INVITABLE_ROLES)[number];
type MemberStatus = (typeof MEMBER_STATUSES)[number];
type AppAccessMode = (typeof APP_ACCESS_MODES)[number];
type ApplicationVisibility = (typeof APPLICATION_VISIBILITY)[number];

/**
 * Declaring the constants
 */

@Schema()
export class OrganisationIdParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  organisationId: bigint;
}

@Schema()
export class MemberParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  userId: bigint;
}

@Schema()
export class InvitationParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  invitationId: bigint;
}

@Schema()
export class CreateOrganisationBody {
  @Field({ minLength: 1, maxLength: 255 })
  name: string;

  @Field(() => String, { ...PATTERN.SLUG, optional: true })
  slug?: string;
}

@Schema()
export class UpdateOrganisationBody {
  @Field({ optional: true, minLength: 1, maxLength: 255 })
  name?: string;

  /** Switching to `ASSIGNED_ONLY` limits members to explicitly assigned apps; owner-only and step-up-gated. */
  @Field(() => String, { optional: true, enum: [...APP_ACCESS_MODES] })
  appAccessMode?: AppAccessMode;
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

  @Field(() => String, { enum: [...APP_ACCESS_MODES] })
  appAccessMode: AppAccessMode;

  @Field()
  createdAt: string;
}

@Schema()
export class MemberItem {
  @Field(() => String)
  userId: bigint;

  @Field(() => String, { enum: [...MEMBER_ROLES] })
  role: MemberRole;

  @Field(() => String, { enum: [...MEMBER_STATUSES] })
  status: MemberStatus;

  @Field({ optional: true, maxLength: 256 })
  statusReason?: string;

  @Field({ optional: true })
  statusUntil?: string;

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
export class UpdateMemberStatusBody {
  @Field(() => String, { enum: [...MEMBER_STATUSES] })
  status: MemberStatus;

  @Field({ optional: true, maxLength: 256 })
  reason?: string;

  /** ISO-8601 lapse time; accepted only alongside SUSPENDED. */
  @Field({ optional: true })
  until?: string;
}

@Schema()
export class InviteMemberBody {
  @Field({ ...PATTERN.EMAIL })
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
  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { ...PATTERN.ID })
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

@Schema()
export class OrganisationApplicationParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { ...PATTERN.ID })
  @Transform('int:parse')
  applicationId: number;
}

@Schema()
export class AssignApplicationBody {
  /** The application the organisation is adding to its allowlist; must be one its members can reach. */
  @Field(() => String, { ...PATTERN.ID })
  @Transform('int:parse')
  applicationId: number;
}

@Schema()
export class OrganisationApplicationItem {
  @Field(() => Number)
  id: number;

  @Field()
  name: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  displayName?: string;

  @Field()
  subDomain: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  logoUrl?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  homePageUrl?: string;

  @Field(() => String, { enum: [...APPLICATION_VISIBILITY] })
  visibility: ApplicationVisibility;

  /** Whether this org has added the app to its allowlist; meaningful chiefly under `ASSIGNED_ONLY`. */
  @Field(() => Boolean)
  assigned: boolean;
}

@Schema()
export class OrganisationApplicationsResponse {
  @Field(() => String, { enum: [...APP_ACCESS_MODES] })
  appAccessMode: AppAccessMode;

  @Field(() => [OrganisationApplicationItem])
  applications: OrganisationApplicationItem[];
}
