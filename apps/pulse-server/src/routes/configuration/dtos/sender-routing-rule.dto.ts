/**
 * Importing npm packages
 */
import { Field, PickType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */
import { type Template, schema } from '@modules/datastore';

import { SenderProfileResponse } from './sender-profile.dto';

/**
 * Declaring the constants
 */

@Schema()
export class CreateRoutingRuleBody {
  @Field(() => String)
  @Transform('bigint:parse')
  senderProfileId: bigint;

  @Field(() => String, { enum: schema.messageTypes.enumValues, optional: true })
  messageType?: Template.MessageType;

  @Field({ optional: true })
  region?: string;

  @Field({ optional: true })
  service?: string;
}

@Schema()
export class SenderRoutingRuleResponse extends PickType(CreateRoutingRuleBody, ['senderProfileId'] as const) {
  @Field(() => String, { enum: schema.messageTypes.enumValues, optional: true })
  @Transform('strip:null')
  messageType: Template.MessageType | null;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  region: string | null;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  service: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class SenderRoutingRuleDetailResponse extends SenderRoutingRuleResponse {
  @Field()
  profile: SenderProfileResponse;
}

@Schema()
export class UpdateSenderRoutingRuleBody extends PickType(CreateRoutingRuleBody, ['senderProfileId']) {}

@Schema()
export class ListSenderRoutingRulesQuery extends PaginationQuery(['createdAt', 'updatedAt'] as const) {
  @Field(() => String, { enum: schema.messageTypes.enumValues, optional: true })
  messageType?: Template.MessageType;

  @Field({ optional: true })
  region?: string;

  @Field({ optional: true })
  serviceName?: string;
}

@Schema()
export class SenderRoutingRuleParams {
  @Field(() => String)
  @Transform('bigint:parse')
  routingRuleId: bigint;
}

@Schema()
export class ListSenderRoutingRuleResponse extends Paginated(SenderRoutingRuleResponse) {}
