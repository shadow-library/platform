/**
 * Importing npm packages
 */
import { Field, OmitType, PickType, Schema } from '@shadow-library/class-schema';
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
export class CreateSenderAssignmentBody {
  @Field(() => String)
  @Transform('bigint:parse')
  senderProfileId: bigint;

  @Field(() => String, { enum: schema.messageTypes.enumValues })
  messageType: Template.MessageType;

  @Field({ optional: true })
  region?: string;

  @Field({ optional: true })
  serviceName?: string;
}

@Schema()
export class SenderAssignmentResponse extends OmitType(CreateSenderAssignmentBody, ['region', 'serviceName'] as const) {
  @Field()
  region: string;

  @Field()
  serviceName: string;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class SenderAssignmentDetailResponse extends SenderAssignmentResponse {
  @Field()
  profile: SenderProfileResponse;
}

@Schema()
export class UpdateSenderAssignmentBody extends PickType(CreateSenderAssignmentBody, ['senderProfileId']) {}

@Schema()
export class ListSenderAssignmentsQuery extends PaginationQuery(['createdAt', 'updatedAt'] as const) {
  @Field(() => String, { enum: schema.messageTypes.enumValues, optional: true })
  messageType?: Template.MessageType;

  @Field({ optional: true })
  region?: string;

  @Field({ optional: true })
  serviceName?: string;
}

@Schema()
export class SenderAssignmentParams {
  @Field()
  serviceName: string;

  @Field(() => String, { enum: schema.messageTypes.enumValues })
  messageType: Template.MessageType;

  @Field()
  region: string;
}

@Schema()
export class ListSenderAssignmentResponse extends Paginated(SenderAssignmentResponse) {}
