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
  @Field({ ...PATTERN.CLIENT_ID })
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
  @Field({ ...PATTERN.UUID })
  ruleId: string;
}
