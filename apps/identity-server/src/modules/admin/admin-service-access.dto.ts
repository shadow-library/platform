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
export class ServiceAccessListQuery {
  @Field(() => Number)
  applicationId: number;
}

@Schema()
export class CreateServiceAccessBody {
  /** The application whose routes the rule opens up */
  @Field(() => Number)
  applicationId: number;

  /** The SERVICE client allowed to call (client id slug or legacy UUID) */
  @Field({ pattern: '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' })
  callerClientId: string;

  /** HTTP method the rule covers, or `*` for all methods */
  @Field({ maxLength: 10 })
  method: string;

  /** Route path the rule covers; a trailing `*` matches any suffix */
  @Field({ maxLength: 512 })
  pathPattern: string;
}

@Schema()
export class ServiceAccessRuleItem {
  @Field()
  id: string;

  @Field(() => Number)
  applicationId: number;

  @Field()
  callerClientId: string;

  @Field()
  method: string;

  @Field()
  pathPattern: string;

  @Field()
  createdAt: string;
}

@Schema()
export class ServiceAccessListResponse {
  @Field(() => [ServiceAccessRuleItem])
  items: ServiceAccessRuleItem[];
}

@Schema()
export class ServiceAccessRuleParams {
  @Field({ pattern: '^[0-9a-fA-F-]{36}$' })
  ruleId: string;
}
