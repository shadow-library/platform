import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { ContentMode, CostTier, JobStatus } from '@server/common';
import { type Job, type Project, type Review, type ReviewFindingCategory, type ReviewFindingSeverity, schema } from '@server/database';

import { ChapterParams } from '../generation/generation.dto';

export const ChapterReviewKind = EnumType.create('ChapterReviewKind', schema.chapterReviewKind.enumValues);
export const ChapterReviewDisposition = EnumType.create('ChapterReviewDisposition', schema.chapterReviewDisposition.enumValues);
export const ReviewRemedyAction = EnumType.create('ReviewRemedyAction', schema.reviewRemedyAction.enumValues);
export const ReviewFindingSeverityType = EnumType.create<ReviewFindingSeverity>('ReviewFindingSeverity', ['blocking', 'warning', 'note']);
export const ReviewFindingCategoryType = EnumType.create<ReviewFindingCategory>('ReviewFindingCategory', [
  'continuity',
  'brief',
  'ending',
  'knowledge',
  'readability',
  'mechanics',
  'editorial',
  'proofreading',
]);

@Schema()
export class ReviewIdParams extends ChapterParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  reviewId: bigint;
}

@Schema()
export class ReviewFindingParams extends ReviewIdParams {
  @Field({ minLength: 1, maxLength: 20 })
  findingId: string;
}

@Schema()
export class RunChapterReviewBody {
  @Field(() => ChapterReviewKind, {
    description:
      'judge: continuity, the plan, the ending contract, kept-back secrets and readability. editorial: an editor’s read against the plan, canon and style, with proofreading (grammar, spelling, punctuation, tense, point of view, names and references). mechanics and readability are deterministic and make no model call.',
  })
  kind: Review.Kind;

  @Field(() => CostTier, {
    optional: true,
    description: 'Runs this review at this tier instead of the one the chat turn or project would use. Ignored by mechanics and readability.',
  })
  costTier?: Project.CostTier;

  @Field(() => ContentMode, {
    optional: true,
    description: 'unrestricted routes this review to the unrestricted models. It can only raise: a chapter written unrestricted or isolated is always reviewed unrestricted.',
  })
  contentMode?: Project.ContentMode;
}

@Schema()
export class ReviewRemedyBody {
  @Field(() => ReviewRemedyAction, {
    description:
      'dismissed: the finding is wrong (needs a reason). fixing_myself: the author will change the text by hand. overridden: the contradiction is intended (blocking findings only). A dismissal or override is remembered for this text and not raised again.',
  })
  action: Review.RemedyAction;

  @Field({ optional: true, maxLength: 2000, description: 'Why. Required to dismiss.' })
  reason?: string;
}

@Schema()
export class ReviewRemedyResponse {
  @Field(() => ReviewRemedyAction)
  action: Review.RemedyAction;

  @Field({ optional: true, nullable: true })
  reason?: string | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ReviewFindingResponse {
  @Field({ description: 'Stable within its review; remedies address the finding by it.' })
  id: string;

  @Field(() => ReviewFindingSeverityType, { description: 'blocking: a contradiction or must-fix; warning: worth fixing; note: for information.' })
  severity: ReviewFindingSeverity;

  @Field(() => ReviewFindingCategoryType)
  category: ReviewFindingCategory;

  @Field()
  text: string;

  @Field({ optional: true, nullable: true, description: 'The passage the finding rests on, verified to appear verbatim in the reviewed text.' })
  evidence?: string | null;

  @Field(() => ReviewRemedyResponse, { optional: true, nullable: true, description: 'The author’s answer to this finding, if any.' })
  remedy?: ReviewRemedyResponse | null;
}

@Schema()
export class ReviewComplianceResponse {
  @Field()
  compliant: boolean;

  @Field(() => [String])
  issues: string[];
}

@Schema({ description: 'One review of one chapter text. It never changes the prose; the author acts on its findings.' })
export class ChapterReviewRecordResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field(() => ChapterReviewKind)
  kind: Review.Kind;

  @Field(() => ChapterReviewDisposition, { description: 'clear renders as "No issue detected · revision N"; failed means the review could not be read and checked nothing.' })
  disposition: Review.Disposition;

  @Field({
    optional: true,
    nullable: true,
    description: "The model's own verdict: consistent / contradiction / evaluation_failed for the judge, approve / revision_requested for the editor.",
  })
  verdict?: string | null;

  @Field({ optional: true, nullable: true, description: "The editor's overall note to the author." })
  note?: string | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The draft revision that was reviewed; null for finalized prose that has no draft.' })
  draftRevision?: number | null;

  @Field({ description: 'True once the chapter text has changed since this review; its findings then describe an older text.' })
  stale: boolean;

  @Field({ description: 'The reviewed chapter is isolated or written unrestricted; its findings may quote prose a standard model must not read.' })
  isolated: boolean;

  @Field(() => [ReviewFindingResponse])
  findings: ReviewFindingResponse[];

  @Field(() => Integer, { description: 'Findings not yet dismissed or overridden.' })
  openFindings: number;

  @Field(() => Integer, { description: 'Blocking findings not yet dismissed or overridden.' })
  openBlocking: number;

  @Field(() => [String], { description: 'What this review checked, in plain words, for the "No issue detected" line.' })
  checked: string[];

  @Field(() => ReviewComplianceResponse, { optional: true, nullable: true })
  briefCompliance?: ReviewComplianceResponse | null;

  @Field(() => ReviewComplianceResponse, { optional: true, nullable: true })
  readabilityCompliance?: ReviewComplianceResponse | null;

  @Field(() => ReviewComplianceResponse, { optional: true, nullable: true })
  endingCompliance?: ReviewComplianceResponse | null;

  @Field(() => ReviewComplianceResponse, { optional: true, nullable: true })
  knowledgeCompliance?: ReviewComplianceResponse | null;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Deterministic measurements (word count, readability averages).' })
  metrics?: Record<string, number> | null;

  @Field({ optional: true, nullable: true, description: 'The run that made the model calls; its usage is readable, its prompts stay admin-only.' })
  runId?: string | null;

  @Field(() => CostTier, { optional: true, nullable: true })
  costTier?: Project.CostTier | null;

  @Field(() => ContentMode, { optional: true, nullable: true })
  contentMode?: Project.ContentMode | null;

  @Field({ optional: true, nullable: true })
  modelProvider?: string | null;

  @Field({ optional: true, nullable: true })
  model?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListChapterReviewsResponse {
  @Field(() => Integer)
  chapter: number;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The draft revision the chapter is at now; null when it has no draft.' })
  currentRevision?: number | null;

  @Field(() => [ChapterReviewRecordResponse], { description: 'The newest review of each kind.' })
  latest: ChapterReviewRecordResponse[];

  @Field(() => [ChapterReviewRecordResponse], { description: 'Every review of this chapter, newest first, up to the most recent 50.' })
  history: ChapterReviewRecordResponse[];
}

@Schema({ description: 'A model review queued as a job; the review appears in the chapter’s reviews when the job is done.' })
export class ChapterReviewJobResponse {
  @Field()
  jobId: string;

  @Field({ description: 'The run the review’s model calls are recorded under; its usage is readable while it runs.' })
  runId: string;

  @Field(() => ChapterReviewKind)
  kind: Review.Kind;

  @Field(() => JobStatus)
  status: Job.Status;
}
