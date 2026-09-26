import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { SortByTime } from '@server/common';

@Schema()
export class VolumeProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class VolumeKeyParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  volumeKey: string;
}

@Schema()
export class VolumeResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field()
  volumeKey: string;

  @Field(() => Integer)
  ordinal: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field({ optional: true, nullable: true, description: 'The goal the volume works towards.' })
  objective?: string | null;

  @Field(() => Integer)
  revision: number;

  @Field({ optional: true, nullable: true, description: "The author's notes on the volume." })
  body?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListVolumesQuery extends PaginationQuery(SortByTime) {}

@Schema()
export class ListVolumeResponse extends Paginated(VolumeResponse) {}
