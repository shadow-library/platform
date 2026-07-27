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

/**
 * Declaring the constants
 */

@Schema()
export class MyApplicationItem {
  @Field(() => Number)
  id: number;

  @Field()
  name: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  displayName?: string;

  @Field()
  subDomain: string;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  homePageUrl?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  logoUrl?: string;

  /** Present only for an app the user has actually opened; an accessible-but-never-launched app omits it. */
  @Field(() => String, { optional: true })
  @Transform('strip:null')
  firstUsedAt?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  lastUsedAt?: string;
}

@Schema()
export class MyApplicationsResponse {
  @Field(() => [MyApplicationItem])
  applications: MyApplicationItem[];
}
