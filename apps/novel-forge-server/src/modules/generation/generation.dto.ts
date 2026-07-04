/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { DraftReviewStatus, DraftRevisionSource, DraftStatus, JudgeVerdict, UserFeedbackDisposition, WorkflowRunStatus } from '@server/common';
import { type Ai, type Generation } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// ─── Shared param schemas ─────────────────────────────────────────────────────

@Schema()
export class ProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class ChapterParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer) n: number;
}

@Schema()
export class RevisionParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer) n: number;
  @Field(() => Integer) r: number;
}

@Schema()
export class RunParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field() runId: string;
}

// ─── Request bodies ───────────────────────────────────────────────────────────

@Schema()
export class SeedFromBriefBody {
  @Field() brief: string;
  @Field({ optional: true }) force?: boolean;
}

@Schema()
export class PlanBody {
  @Field(() => Integer) volumeCount: number;
  @Field(() => Integer) chaptersPerVolume: number;
  @Field({ optional: true }) skeleton?: string;
}

@Schema()
export class OutlineBody {
  @Field(() => Integer, { optional: true }) count?: number;
  @Field(() => Integer, { optional: true }) start?: number;
  @Field({ optional: true }) context?: string;
}

@Schema()
export class UpdateBriefBody {
  @Field({ optional: true }) title?: string;
  @Field() body: string;
}

@Schema()
export class GenerateBody {
  @Field(() => Integer, { optional: true }) limit?: number;
  @Field({ optional: true }) autoFix?: boolean;
  @Field(() => Integer, { optional: true }) maxFixes?: number;
  @Field({ optional: true }) guidance?: string;
}

@Schema()
export class UpdateDraftBody {
  @Field({ optional: true }) title?: string;
  @Field() body: string;
  @Field({ optional: true }) summary?: string;
  @Field(() => Object, { optional: true }) state?: Record<string, unknown>;
}

@Schema()
export class ReviseDraftBody {
  @Field() note: string;
}

@Schema()
export class FeedbackBody {
  @Field() note: string;
  @Field(() => UserFeedbackDisposition, { optional: true }) disposition?: Ai.UserFeedbackDisposition;
}

@Schema()
export class ImportDraftBody {
  @Field() prose: string;
  @Field({ optional: true }) title?: string;
  @Field({ optional: true }) summary?: string;
}

@Schema()
export class FinalizeBody {
  @Field(() => Integer, { optional: true }) chapter?: number;
}

@Schema()
export class GenerateGrokBody {
  @Field({ optional: true }) guidance?: string;
}

@Schema()
export class UpdateContinuityBody {
  @Field(() => Object) proposal: Record<string, unknown>;
}

@Schema()
export class SearchQuery {
  @Field() q: string;
  @Field({ optional: true }) index?: 'prose' | 'lore' | 'both';
  @Field(() => Integer, { optional: true }) k?: number;
}

// ─── Response schemas ─────────────────────────────────────────────────────────

@Schema()
export class WorkflowRunResponse {
  @Field() runId: string;
  @Field() outcome: string;
  @Field() status: string;
}

@Schema()
export class DraftResponse {
  @Field(() => String) id: bigint;
  @Field(() => String) projectId: bigint;
  @Field(() => Integer) chapter: number;
  @Field({ optional: true, nullable: true }) title?: string | null;
  @Field(() => DraftStatus) status: Generation.DraftStatus;
  @Field(() => Integer) revision: number;
  @Field({ optional: true, nullable: true }) summary?: string | null;
  @Field({ optional: true, nullable: true }) body: string;
  @Field(() => Object, { optional: true, nullable: true }) state?: Record<string, unknown> | null;
  @Field({ optional: true, nullable: true }) volumeKey?: string | null;
  @Field(() => DraftReviewStatus) reviewStatus: Generation.DraftReviewStatus;
  @Field(() => JudgeVerdict, { optional: true, nullable: true }) judge?: Generation.JudgeVerdict | null;
  @Field({ optional: true, nullable: true }) judgeNote?: string | null;
  @Field(() => String, { format: 'date-time' }) createdAt: Date;
  @Field(() => String, { format: 'date-time' }) updatedAt: Date;
}

@Schema()
export class BriefResponse {
  @Field(() => String) id: bigint;
  @Field(() => String) projectId: bigint;
  @Field(() => Integer) chapter: number;
  @Field({ optional: true, nullable: true }) volumeKey?: string | null;
  @Field({ optional: true, nullable: true }) title?: string | null;
  @Field() body: string;
  @Field(() => Object, { optional: true, nullable: true }) contextRefs?: Record<string, unknown> | null;
  @Field(() => String, { format: 'date-time' }) createdAt: Date;
  @Field(() => String, { format: 'date-time' }) updatedAt: Date;
}

@Schema()
export class DraftRevisionResponse {
  @Field(() => String) id: bigint;
  @Field(() => String) draftId: bigint;
  @Field(() => Integer) revision: number;
  @Field(() => DraftRevisionSource) source: Ai.DraftRevisionSource;
  @Field() body: string;
  @Field({ optional: true, nullable: true }) summary?: string | null;
  @Field(() => Object, { optional: true, nullable: true }) state?: Record<string, unknown> | null;
  @Field({ optional: true, nullable: true }) runId?: string | null;
  @Field(() => String, { format: 'date-time' }) createdAt: Date;
}

@Schema()
export class UserFeedbackResponse {
  @Field(() => String) id: bigint;
  @Field(() => String) projectId: bigint;
  @Field() artifactType: string;
  @Field() artifactRef: string;
  @Field(() => UserFeedbackDisposition) disposition: Ai.UserFeedbackDisposition;
  @Field({ optional: true, nullable: true }) note?: string | null;
  @Field(() => String, { format: 'date-time' }) createdAt: Date;
}

@Schema()
export class ContinuityProposalResponse {
  @Field(() => String) id: bigint;
  @Field(() => String) projectId: bigint;
  @Field(() => Integer) chapter: number;
  @Field() status: string;
  @Field(() => Object) proposal: Record<string, unknown>;
  @Field({ optional: true, nullable: true }) model?: string | null;
  @Field({ optional: true, nullable: true }) appliedAt?: Date | null;
  @Field(() => String, { format: 'date-time' }) createdAt: Date;
  @Field(() => String, { format: 'date-time' }) updatedAt: Date;
}

@Schema()
export class WorkflowRunDetailResponse {
  @Field() id: string;
  @Field(() => String) projectId: bigint;
  @Field() graph: string;
  @Field() target: string;
  @Field(() => WorkflowRunStatus) status: Ai.WorkflowRunStatus;
  @Field({ optional: true, nullable: true }) outcome?: string | null;
  @Field(() => Object, { optional: true, nullable: true }) input?: Record<string, unknown> | null;
  @Field(() => Object, { optional: true, nullable: true }) error?: Record<string, unknown> | null;
  @Field(() => String, { format: 'date-time' }) startedAt: Date;
  @Field(() => String, { format: 'date-time', optional: true, nullable: true }) endedAt?: Date | null;
}
