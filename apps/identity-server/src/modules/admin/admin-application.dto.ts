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
 *
 * `name` is the stable machine identifier an application is addressed by internally (cache key,
 * bootstrap lookup) — it is slug-shaped and immutable once created. Human-facing text lives on
 * `displayName`; the DNS label lives on `subDomain`.
 */
const NAME_PATTERN = '^[a-z0-9][a-z0-9-]{1,62}$';
const SUBDOMAIN_PATTERN = '^[a-z0-9][a-z0-9-]{0,62}$';

@Schema()
export class ApplicationIdParams {
  @Field({ pattern: '^\\d+$' })
  applicationId: string;
}

@Schema()
export class CreateApplicationBody {
  @Field({ pattern: NAME_PATTERN, maxLength: 63 })
  name: string;

  @Field({ pattern: SUBDOMAIN_PATTERN, maxLength: 63 })
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
}

@Schema()
export class UpdateApplicationBody {
  @Field({ optional: true, pattern: SUBDOMAIN_PATTERN, maxLength: 63 })
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

  @Field()
  updatedAt: string;
}

@Schema()
export class CreateApplicationResponse {
  @Field(() => Number)
  id: number;
}

@Schema()
export class ApplicationMemberParams {
  @Field({ pattern: '^\\d+$' })
  applicationId: string;

  @Field({ pattern: '^\\d+$' })
  userId: string;
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
