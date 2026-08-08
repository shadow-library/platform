import { Field, Integer, OmitType, PartialType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { PlanStatus, SortByTime } from '@server/common';
import { type Plan } from '@server/database';

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
export class CreateVolumeBody {
  @Field()
  volumeKey: string;

  @Field(() => Integer, { optional: true })
  ordinal?: number;

  @Field({ optional: true })
  title?: string;

  @Field({ optional: true })
  objective?: string;

  @Field({ optional: true })
  conflict?: string;

  @Field({ optional: true })
  payoff?: string;

  @Field(() => Integer, { optional: true })
  startChapter?: number;

  @Field(() => Integer, { optional: true })
  endChapter?: number;

  @Field(() => Integer, { optional: true, minimum: 1 })
  targetChapterCount?: number;

  @Field(() => PlanStatus, { optional: true })
  status?: Plan.Status;

  @Field(() => [String], { optional: true, description: 'Entity keys for the characters featured in this volume.' })
  cast?: string[];

  @Field({ optional: true })
  body?: string;
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

  @Field({ optional: true, nullable: true })
  objective?: string | null;

  @Field({ optional: true, nullable: true })
  conflict?: string | null;

  @Field({ optional: true, nullable: true })
  payoff?: string | null;

  @Field(() => Integer, { optional: true, nullable: true })
  startChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  endChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  targetChapterCount?: number | null;

  @Field(() => Integer)
  revision: number;

  @Field({ optional: true, nullable: true })
  staleReason?: string | null;

  @Field(() => PlanStatus)
  status: Plan.Status;

  @Field(() => [String], { optional: true, nullable: true, description: 'Entity keys for the characters featured in this volume.' })
  cast?: string[] | null;

  @Field({ optional: true, nullable: true })
  body?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema({ minProperties: 1 })
export class UpdateVolumeBody extends PartialType(OmitType(CreateVolumeBody, ['volumeKey'] as const)) {}

@Schema()
export class ListVolumesQuery extends PaginationQuery(SortByTime) {
  @Field(() => PlanStatus, { optional: true })
  status?: Plan.Status;
}

@Schema()
export class ListVolumeResponse extends Paginated(VolumeResponse) {}

@Schema()
export class ApprovePlanResponse {
  @Field(() => Integer)
  volumesApproved: number;

  @Field()
  approved: boolean;
}
