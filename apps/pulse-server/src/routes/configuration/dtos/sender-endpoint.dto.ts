/**
 * Importing npm packages
 */
import { Field, OmitType, PartialType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */
import { type Configuration, type Notification, schema } from '@modules/datastore';

/**
 * Declaring the constants
 */

@Schema()
export class CreateSenderEndpointBody {
  @Field(() => String, { enum: schema.notificationChannel.enumValues })
  channel: Notification.Channel;

  @Field(() => String, { enum: schema.notificationServiceProviders.enumValues })
  provider: Configuration.ServiceProvider;

  @Field()
  identifier: string;

  @Field({ optional: true })
  weight?: number;

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class SenderEndpointResponse extends OmitType(CreateSenderEndpointBody, ['weight', 'isActive'] as const) {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  senderProfileId: bigint;

  @Field()
  weight: number;

  @Field()
  isActive: boolean;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema({ minProperties: 1 })
export class UpdateSenderEndpointBody extends PartialType(OmitType(CreateSenderEndpointBody, ['channel', 'provider'])) {}

@Schema()
export class ListSenderEndpointsQuery extends PaginationQuery(['createdAt', 'updatedAt'] as const) {
  @Field(() => String, { enum: schema.notificationChannel.enumValues, optional: true })
  channel?: Notification.Channel;

  @Field(() => String, { enum: schema.notificationServiceProviders.enumValues, optional: true })
  provider?: Configuration.ServiceProvider;

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class SenderEndpointParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  profileId: bigint;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  endpointId: bigint;
}

@Schema()
export class SenderEndpointProfileParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  profileId: bigint;
}

@Schema()
export class ListSenderEndpointResponse extends Paginated(SenderEndpointResponse) {}
