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

/**
 * Declaring the constants
 */

@Schema()
export class ApplicationIdParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('int:parse')
  applicationId: number;
}

@Schema()
export class CreateApplicationBody {
  /**
   * The stable machine identifier an application is addressed by internally (cache key, bootstrap lookup) — slug-shaped
   * and immutable once created. Human-facing text lives on `displayName`; the DNS label lives on `subDomain`.
   */
  @Field({ ...PATTERN.APPLICATION_NAME, maxLength: 63 })
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

  /** Public browser origins for the app's relying-party clients; each becomes an `/api/auth/callback` redirect URI. */
  @Field(() => [String], { optional: true })
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

  /** Public browser origins for the app's relying-party clients; each becomes an `/api/auth/callback` redirect URI. */
  @Field(() => [String], { optional: true })
  publicUrls?: string[];
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

  /** Public browser origins; each yields an `/api/auth/callback` redirect URI on the app's relying-party clients. */
  @Field(() => [String])
  publicUrls: string[];

  @Field()
  updatedAt: string;
}

@Schema()
export class CreateApplicationResponse {
  @Field(() => Number)
  id: number;

  /**
   * The application's identity, provisioned with it rather than configured separately (D-21): one
   * client and one derived `api://<app>` audience. The secret is shown exactly once, here.
   */
  @Field()
  clientId: string;

  @Field()
  audience: string;

  @Field({ optional: true })
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
