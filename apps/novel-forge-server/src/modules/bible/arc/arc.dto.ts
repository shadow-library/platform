import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { PlanStatus } from '@server/common';
import { type Plan } from '@server/database';

@Schema()
export class VolumeArcsParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  volumeKey: string;
}

@Schema()
export class ArcKeyParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  arcKey: string;
}

@Schema()
export class UpsertArcBody {
  @Field()
  volumeKey: string;

  @Field(() => Integer, { optional: true })
  ordinal?: number;

  @Field({ optional: true })
  title?: string;

  @Field({ optional: true })
  objective?: string;

  @Field({ optional: true })
  escalation?: string;

  @Field({ optional: true })
  payoff?: string;

  @Field({ optional: true })
  hook?: string;

  @Field(() => Integer, { optional: true })
  chapterStart?: number;

  @Field(() => Integer, { optional: true })
  chapterEnd?: number;

  @Field(() => [String], { optional: true })
  cast?: string[];

  @Field({ optional: true })
  body?: string;
}

@Schema()
export class ArcResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field()
  arcKey: string;

  @Field()
  volumeKey: string;

  @Field(() => Integer)
  ordinal: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field({ optional: true, nullable: true })
  objective?: string | null;

  @Field({ optional: true, nullable: true })
  escalation?: string | null;

  @Field({ optional: true, nullable: true })
  payoff?: string | null;

  @Field({ optional: true, nullable: true })
  hook?: string | null;

  @Field(() => Integer, { optional: true, nullable: true })
  chapterStart?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  chapterEnd?: number | null;

  @Field(() => [String], { optional: true, nullable: true })
  cast?: string[] | null;

  @Field(() => PlanStatus)
  status: Plan.Status;

  @Field({ optional: true, nullable: true })
  body?: string | null;

  @Field(() => Integer)
  revision: number;

  @Field({ optional: true, nullable: true })
  staleReason?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListArcResponse {
  @Field(() => [ArcResponse])
  arcs: ArcResponse[];
}

@Schema()
export class ApproveArcsResponse {
  @Field(() => Integer)
  arcsApproved: number;

  @Field()
  approved: boolean;
}
