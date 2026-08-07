import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { PATTERN } from '@server/constants';

const APPLICATION_VISIBILITY = ['PUBLIC', 'RESTRICTED', 'INTERNAL'] as const;
const ORGANISATION_APPLICATION_SOURCE = ['PLATFORM_RELEASE', 'ORG_ASSIGNMENT'] as const;

type ApplicationVisibility = (typeof APPLICATION_VISIBILITY)[number];
type OrganisationApplicationSource = (typeof ORGANISATION_APPLICATION_SOURCE)[number];

@Schema()
export class ApplicationIdParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('int:parse')
  applicationId: number;
}

@Schema()
export class CreateApplicationBody {
  @Field({
    ...PATTERN.APPLICATION_NAME,
    maxLength: 63,
    description: 'Stable, immutable machine identifier used for internal addressing; human-facing text belongs in displayName and the DNS label in subDomain.',
  })
  name: string;

  @Field({ ...PATTERN.SUBDOMAIN, maxLength: 63 })
  subDomain: string;

  @Field({ optional: true, maxLength: 255 })
  displayName?: string;

  @Field({ optional: true, maxLength: 1024 })
  description?: string;

  @Field({ optional: true, maxLength: 2048 })
  homePageUrl?: string;

  @Field({ optional: true, maxLength: 2048 })
  logoUrl?: string;

  @Field(() => Boolean, { optional: true })
  isActive?: boolean;

  @Field(() => [String], { optional: true, description: 'Public browser origins for the application; each becomes an /api/auth/callback redirect URI.' })
  publicUrls?: string[];
}

@Schema()
export class UpdateApplicationBody {
  @Field({ ...PATTERN.SUBDOMAIN, optional: true, maxLength: 63 })
  subDomain?: string;

  @Field({ optional: true, maxLength: 255 })
  displayName?: string;

  @Field({ optional: true, maxLength: 1024 })
  description?: string;

  @Field({ optional: true, maxLength: 2048 })
  homePageUrl?: string;

  @Field({ optional: true, maxLength: 2048 })
  logoUrl?: string;

  @Field(() => Boolean, { optional: true })
  isActive?: boolean;

  @Field(() => String, {
    optional: true,
    enum: [...APPLICATION_VISIBILITY],
    description: "Controls how widely the application may be granted; changing it re-resolves every organisation's grant set.",
  })
  visibility?: ApplicationVisibility;

  @Field(() => [String], { optional: true, description: 'Public browser origins for the application; each becomes an /api/auth/callback redirect URI.' })
  publicUrls?: string[];
}

@Schema()
export class ApplicationOrganisationParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('int:parse')
  applicationId: number;

  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  organisationId: bigint;
}

@Schema()
export class ReleaseApplicationBody {
  @Field(() => String, { ...PATTERN.ID, description: 'Team organisation to which the restricted application is released.' })
  @Transform('bigint:parse')
  organisationId: bigint;
}

@Schema()
export class ApplicationOrganisationItem {
  @Field()
  organisationId: string;

  @Field()
  slug: string;

  @Field()
  name: string;

  @Field(() => String, { enum: [...ORGANISATION_APPLICATION_SOURCE] })
  source: OrganisationApplicationSource;

  @Field()
  assignedAt: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  assignedBy?: string;
}

@Schema()
export class ApplicationOrganisationListResponse {
  @Field(() => [ApplicationOrganisationItem])
  items: ApplicationOrganisationItem[];
}

@Schema()
export class ApplicationSummaryItem {
  @Field(() => Number)
  id: number;

  @Field()
  name: string;

  @Field(() => String, { optional: true })
  displayName?: string;

  @Field()
  subDomain: string;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => String, { enum: [...APPLICATION_VISIBILITY] })
  visibility: ApplicationVisibility;

  @Field()
  createdAt: string;
}

@Schema()
export class ApplicationListResponse {
  @Field(() => [ApplicationSummaryItem])
  items: ApplicationSummaryItem[];
}

@Schema()
export class ApplicationRoleItem {
  @Field(() => Number)
  id: number;

  @Field()
  roleName: string;

  @Field(() => String, { optional: true })
  description?: string;
}

@Schema()
export class ApplicationDetailResponse extends ApplicationSummaryItem {
  @Field(() => String, { optional: true })
  description?: string;

  @Field(() => String, { optional: true })
  homePageUrl?: string;

  @Field(() => String, { optional: true })
  logoUrl?: string;

  @Field(() => [ApplicationRoleItem])
  roles: ApplicationRoleItem[];

  @Field(() => [String], { description: "Public browser origins; each yields an /api/auth/callback redirect URI on the application's relying-party clients." })
  publicUrls: string[];

  @Field()
  updatedAt: string;
}

@Schema()
export class CreateApplicationResponse {
  @Field(() => Number)
  id: number;

  @Field({ description: "Provisioned client identifier for the application's identity." })
  clientId: string;

  @Field({ description: 'Derived api://<app> audience provisioned for the application.' })
  audience: string;

  @Field({ optional: true, description: 'Provisioned client secret, returned exactly once.' })
  clientSecret?: string;
}

@Schema()
export class ApplicationMemberParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('int:parse')
  applicationId: number;

  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  userId: bigint;
}

@Schema()
export class ApplicationMemberItem {
  @Field()
  userId: string;

  @Field(() => String, { optional: true })
  username?: string;

  @Field(() => String, { optional: true })
  primaryEmail?: string;

  @Field()
  firstUsedAt: string;

  @Field()
  lastUsedAt: string;
}

@Schema()
export class ApplicationMemberListResponse {
  @Field(() => [ApplicationMemberItem])
  items: ApplicationMemberItem[];
}
