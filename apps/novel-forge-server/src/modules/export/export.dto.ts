import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

@Schema()
export class ExportParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}
