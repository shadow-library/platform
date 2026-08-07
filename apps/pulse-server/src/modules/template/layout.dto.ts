import { Field, OmitType, PartialType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { VersionStatus } from '@server/common';
import { type Template } from '@server/database';

@Schema()
export class CreateLayoutBody {
  @Field()
  layoutKey: string;

  @Field()
  name: string;

  @Field({ optional: true })
  @Transform({ output: 'strip:null' })
  description?: string | null;

  @Field({ optional: true })
  isActive?: boolean;
}

@Schema()
export class LayoutResponse extends OmitType(CreateLayoutBody, ['isActive'] as const) {
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
export class LayoutVersionResponse {
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
export class LayoutDetailResponse extends LayoutResponse {
  @Field(() => [LayoutVersionResponse])
  versions: LayoutVersionResponse[];
}

@Schema()
export class LayoutListResponse {
  @Field(() => [LayoutResponse])
  items: LayoutResponse[];
}

@Schema({ minProperties: 1 })
export class UpdateLayoutBody extends PartialType(OmitType(CreateLayoutBody, ['layoutKey'])) {}

@Schema()
export class SaveLayoutDraftBody {
  @Field()
  body: string;

  @Field({ optional: true })
  notes?: string;
}

@Schema()
export class PublishLayoutBody {
  @Field({ optional: true })
  notes?: string;
}

@Schema()
export class LayoutParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  layoutId: bigint;
}
