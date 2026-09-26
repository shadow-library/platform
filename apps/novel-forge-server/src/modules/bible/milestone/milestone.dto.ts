import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { MilestoneKind, MilestoneState } from '@server/common';
import { type Knowledge } from '@server/database';

const MILESTONE_KEY_PATTERN = '^\\S+$';

@Schema()
export class MilestoneProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class MilestoneKeyParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  milestoneKey: string;
}

@Schema()
export class CreateMilestoneBody {
  @Field({ minLength: 1, maxLength: 200, pattern: MILESTONE_KEY_PATTERN, description: 'Stable key that plans claim and unlock conditions name; never changes.' })
  milestoneKey: string;

  @Field({ minLength: 1, maxLength: 500, pattern: '\\S' })
  label: string;

  @Field({ optional: true, nullable: true, description: 'The character the milestone concerns.' })
  subjectEntityKey?: string | null;

  @Field(() => MilestoneKind, { optional: true, description: 'Defaults to custom.' })
  kind?: Knowledge.MilestoneKind;
}

@Schema({ minProperties: 1 })
export class UpdateMilestoneBody {
  @Field({ optional: true, minLength: 1, maxLength: 500, pattern: '\\S' })
  label?: string;

  @Field({ optional: true, nullable: true, description: 'Omit to keep, send null to clear.' })
  subjectEntityKey?: string | null;

  @Field(() => MilestoneKind, { optional: true })
  kind?: Knowledge.MilestoneKind;
}

@Schema()
export class MilestoneResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field()
  milestoneKey: string;

  @Field()
  label: string;

  @Field({ optional: true, nullable: true })
  subjectEntityKey?: string | null;

  @Field(() => MilestoneKind)
  kind: Knowledge.MilestoneKind;

  @Field(() => MilestoneState, { description: 'open until a plan claims it, planned while one does, reached once the claiming chapter is finalized.' })
  state: Knowledge.MilestoneState;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The chapter whose plan claims it; provisional until that chapter is final.' })
  plannedChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The finalized chapter that reached it.' })
  reachedChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The approved draft revision that chapter was finalized from.' })
  boundRevision?: number | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListMilestonesResponse {
  @Field(() => [MilestoneResponse])
  milestones: MilestoneResponse[];
}
