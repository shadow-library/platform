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
 */

@Schema()
export class MyApplicationItem {
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
  firstUsedAt: string;

  @Field()
  lastUsedAt: string;
}

@Schema()
export class MyApplicationsResponse {
  @Field(() => [MyApplicationItem])
  applications: MyApplicationItem[];
}
