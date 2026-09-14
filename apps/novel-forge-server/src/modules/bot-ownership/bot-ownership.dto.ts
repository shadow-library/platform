import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

@Schema()
export class BotParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  botId: bigint;
}

@Schema()
export class TransferOwnershipBody {
  @Field(() => String, { pattern: '^[0-9]+$', description: 'Identity user id the bot-owned rows are reassigned to.' })
  @Transform('bigint:parse')
  toUserId: bigint;
}

@Schema()
export class BotOwnershipResponse {
  @Field(() => Integer)
  projects: number;

  @Field(() => Integer)
  illustrations: number;
}

@Schema()
export class TransferOwnershipResponse {
  @Field(() => Integer, { description: 'Projects this call reassigned; a retry of an applied transfer reports zero.' })
  projects: number;

  @Field(() => Integer, { description: 'Illustrations this call reassigned; a retry of an applied transfer reports zero.' })
  illustrations: number;
}
