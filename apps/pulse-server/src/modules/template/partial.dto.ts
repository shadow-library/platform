import { Field, OmitType, PartialType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { VersionStatus } from '@server/common';
import { type Template } from '@server/database';

@Schema()
export class CreatePartialBody {
  @Field()
  partialKey: string;

  @Field()
  name: string;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  description?: string | null;

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class PartialResponse extends OmitType(CreatePartialBody, ['isActive'] as const) {
  @Field(() => String)
  id: bigint;

  @Field()
  isActive: boolean;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class PartialVersionResponse {
  @Field()
  version: number;

  @Field(() => VersionStatus)
  status: Template.VersionStatus;

  @Field()
  body: string;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  notes?: string | null;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  editedBy?: string | null;

  @Field(() => String, { format: 'date-time', optional: true })
  @Transform({ output: 'strip:null' })
  publishedAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class PartialDetailResponse extends PartialResponse {
  @Field(() => [PartialVersionResponse])
  versions: PartialVersionResponse[];
}

@Schema()
export class PartialListResponse {
  @Field(() => [PartialResponse])
  items: PartialResponse[];
}

@Schema({ minProperties: 1 })
export class UpdatePartialBody extends PartialType(OmitType(CreatePartialBody, ['partialKey'])) {}

@Schema()
export class SavePartialDraftBody {
  @Field()
  body: string;

  @Field({ optional: true })
  notes?: string;
}

@Schema()
export class PublishPartialBody {
  @Field({ optional: true })
  notes?: string;
}

@Schema()
export class PartialParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  partialId: bigint;
}
