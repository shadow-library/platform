/**
 * Importing npm packages
 */
import { Field, OmitType, PartialType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */

/**
 * Declaring the constants
 */

@Schema()
export class CreateSenderProfileBody {
  @Field()
  key: string;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  displayName?: string | null;

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class SenderProfileResponse extends OmitType(CreateSenderProfileBody, ['isActive'] as const) {
  @Field(() => String)
  id: bigint;

  @Field()
  isActive: boolean;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema({ minProperties: 1 })
export class UpdateSenderProfileBody extends PartialType(OmitType(CreateSenderProfileBody, ['key'])) {}

@Schema()
export class ListSenderProfilesQuery extends PaginationQuery(['createdAt', 'updatedAt'] as const) {
  @Field({ optional: true })
  key?: string;

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class SenderProfileParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  profileId: bigint;
}

@Schema()
export class ListSenderProfileResponse extends Paginated(SenderProfileResponse) {}
