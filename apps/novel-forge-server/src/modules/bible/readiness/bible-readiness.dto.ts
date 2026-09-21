import { EnumType, Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { BIBLE_STAGE_ORDER, type BibleStage } from '@modules/bible/bible-manifest';
import { BIBLE_READINESS_DIMENSIONS, BIBLE_READINESS_VERDICTS, type BibleReadinessDimensionName, type BibleReadinessVerdict } from '@modules/eval/bible-readiness';

export const BibleReadinessDimensionEnum = EnumType.create<BibleReadinessDimensionName>('BibleReadinessDimension', [...BIBLE_READINESS_DIMENSIONS]);
export const BibleStageEnum = EnumType.create<BibleStage>('BibleStage', [...BIBLE_STAGE_ORDER]);
export const BibleReadinessVerdictEnum = EnumType.create<BibleReadinessVerdict>('BibleReadinessVerdict', [...BIBLE_READINESS_VERDICTS]);

@Schema()
export class BibleReadinessParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class BibleReadinessDimensionResponse {
  @Field(() => BibleReadinessDimensionEnum)
  dimension: BibleReadinessDimensionName;

  @Field(() => BibleReadinessVerdictEnum, { description: 'strong = every check passed, thin = some passed, empty = none passed' })
  verdict: BibleReadinessVerdict;

  @Field(() => Number, { description: 'checks this dimension passed' })
  satisfied: number;

  @Field(() => Number, { description: 'checks this dimension ran; zero means the dimension had nothing to judge and reads as strong' })
  total: number;

  @Field(() => [String], { description: 'what to fix, phrased as an action an author can take' })
  gaps: string[];
}

@Schema()
export class BibleReadinessRoleResponse {
  @Field(() => BibleStageEnum)
  stage: BibleStage;

  @Field({ description: 'what the role is called on the readiness banner' })
  label: string;

  @Field({ description: 'the canonical `section/slug` the bible builder writes this role to' })
  address: string;

  @Field({ description: 'true when any document or record set carries the substance this role needs, whatever it is named' })
  covered: boolean;

  @Field(() => [String], { description: 'the documents (`section/slug`) and record summaries that cover the role; empty when it is uncovered' })
  coveredBy: string[];
}

@Schema()
export class BibleReadinessResponse {
  @Field(() => [BibleReadinessDimensionResponse])
  dimensions: BibleReadinessDimensionResponse[];

  @Field(() => [BibleReadinessRoleResponse], { optional: true, description: 'one entry per bible role, in manifest order, explaining what the coverage dimension counted' })
  roles?: BibleReadinessRoleResponse[];

  @Field({ description: 'false while canon is absent or exists only as prose the Story Bible cannot read' })
  readyToDraft: boolean;

  @Field(() => [String], { description: 'the coverage and record gaps that hold `readyToDraft` false' })
  blockingGaps: string[];
}
