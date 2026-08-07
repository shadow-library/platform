import { Field, Schema } from '@shadow-library/class-schema';

import { PATTERN } from '@server/constants';

@Schema()
export class ServiceAccessListQuery {
  @Field(() => Number)
  applicationId: number;
}

@Schema()
export class CreateServiceAccessBody {
  @Field(() => Number, { description: 'Application whose routes the rule opens.' })
  applicationId: number;

  @Field({ ...PATTERN.CLIENT_ID, description: 'Service client allowed to call the routes.' })
  callerClientId: string;

  @Field({ maxLength: 10, description: 'HTTP method covered by the rule, or * for all methods.' })
  method: string;

  @Field({ maxLength: 512, description: 'Route path covered by the rule; a trailing * matches any suffix.' })
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
