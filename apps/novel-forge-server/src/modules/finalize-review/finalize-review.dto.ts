import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { FinalizeReviewBasis, FinalizeReviewCategory, FinalizeReviewDecision, FinalizeReviewFlag, FinalizeReviewStatus, FinalizeReviewTriage } from '@server/common';
import { type FinalizeReview } from '@server/database';

import { ChapterParams } from '../generation/generation.dto';

@Schema()
export class FinalizeReviewItemParams extends ChapterParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  itemId: bigint;
}

@Schema()
export class FinalizeReviewItemDecisionBody {
  @Field(() => FinalizeReviewDecision, {
    description: 'kept: applied at finalize as proposed. edited: applied with `edited` laid over it. skipped: never applied and never asked again for this revision.',
  })
  decision: FinalizeReview.Decision;

  @Field(() => Object, {
    optional: true,
    additionalProperties: true,
    description:
      'With `edited`: only the fields to change, e.g. {"statusNote": "…"} or {"reached": true}. The keys naming the record are not editable; an appearance has nothing to edit.',
  })
  edited?: Record<string, unknown>;

  @Field({ optional: true, maxLength: 2000, description: 'Why. Required with `skipped`, remembered with the decision.' })
  reason?: string;
}

@Schema()
export class FinalizeReviewSettingsBody {
  @Field(() => [FinalizeReviewCategory], { description: 'Categories whose routine updates are kept without asking. Consequential updates are always asked.' })
  autoKeep: FinalizeReview.Category[];
}

@Schema()
export class FinalizeReviewSettingsResponse {
  @Field(() => [FinalizeReviewCategory])
  autoKeep: FinalizeReview.Category[];
}

@Schema()
export class FinalizeReviewItemResponse {
  @Field(() => String, { description: 'Decisions address the item by it.' })
  id: bigint;

  @Field(() => FinalizeReviewCategory)
  category: FinalizeReview.Category;

  @Field(() => FinalizeReviewTriage, { description: 'consequential: asked one by one. routine: batched, and kept automatically in an auto-keep category.' })
  triage: FinalizeReview.Triage;

  @Field(() => FinalizeReviewBasis, { description: 'observed: stated outright in the prose. inferred: read between the lines — check it.' })
  basis: FinalizeReview.Basis;

  @Field({ description: 'The record the update is about: an entity, promise or milestone key.' })
  subjectKey: string;

  @Field({ description: 'The update in plain words.' })
  claim: string;

  @Field({ optional: true, nullable: true, description: 'The line it came from; withheld on an isolated chapter.' })
  evidence?: string | null;

  @Field(() => Object, { additionalProperties: true, description: 'The change finalize applies when the item is kept.' })
  proposed: Record<string, unknown>;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'The change as the author edited it; applied instead of `proposed`.' })
  edited?: Record<string, unknown> | null;

  @Field(() => FinalizeReviewFlag, {
    optional: true,
    nullable: true,
    description:
      'missed_milestone: the plan claims it but the prose does not reach it, so it stays locked. unclaimed_milestone: the prose seems to reach one the plan does not claim. unplanned_disclosure: a character learns a fact still locked here.',
  })
  flag?: FinalizeReview.Flag | null;

  @Field(() => [String], {
    optional: true,
    nullable: true,
    description: 'What the flag puts at stake: the reveals that need a missed milestone, or what a disclosure still waits on.',
  })
  dependents?: string[] | null;

  @Field(() => FinalizeReviewDecision, { optional: true, nullable: true })
  decision?: FinalizeReview.Decision | null;

  @Field({ optional: true, nullable: true })
  reason?: string | null;

  @Field({ description: 'Kept by the author’s auto-keep setting rather than by hand.' })
  autoKept: boolean;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  decidedAt?: Date | null;
}

@Schema()
export class FinalizeReviewDisclosureResponse {
  @Field()
  clear: boolean;

  @Field(() => [String])
  findings: string[];

  @Field({ description: 'e.g. "No unplanned disclosure detected · revision 4".' })
  copy: string;
}

@Schema()
export class FinalizeReviewOpenResponse {
  @Field(() => Integer)
  consequential: number;

  @Field(() => Integer)
  routine: number;
}

@Schema()
export class FinalizeReviewResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field(() => Integer, { description: 'The approved revision the updates were read from.' })
  draftRevision: number;

  @Field(() => FinalizeReviewStatus)
  status: FinalizeReview.Status;

  @Field({ description: 'False once the prose changed after approval: the review no longer applies and the chapter must be approved again.' })
  current: boolean;

  @Field()
  isolated: boolean;

  @Field({ optional: true, nullable: true, description: 'Why reading the updates failed, when it did.' })
  error?: string | null;

  @Field(() => FinalizeReviewDisclosureResponse)
  disclosure: FinalizeReviewDisclosureResponse;

  @Field(() => FinalizeReviewOpenResponse, { description: 'Items still waiting for an answer; finalize refuses until both are zero.' })
  open: FinalizeReviewOpenResponse;

  @Field(() => [FinalizeReviewItemResponse])
  consequential: FinalizeReviewItemResponse[];

  @Field(() => [FinalizeReviewItemResponse])
  routine: FinalizeReviewItemResponse[];

  @Field(() => [FinalizeReviewCategory])
  autoKeep: FinalizeReview.Category[];

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  appliedAt?: Date | null;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  revertedAt?: Date | null;
}
