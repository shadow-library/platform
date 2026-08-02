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
import { DraftReviewStatus, DraftRevisionSource, DraftStatus, JobKind, JobStatus, PlanStatus, UserFeedbackDisposition, WorkflowRunStatus } from '@server/common';
import { type Ai, type Generation } from '@server/database';

import { KnowledgeContractSchema } from '../ai/schemas';

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

  @Field(() => Integer)
  n: number;
}

@Schema()
export class ArcOutlineParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  arcKey: string;
}

@Schema()
export class OutlineArcBody {
  @Field({ optional: true })
  context?: string;
}

@Schema()
export class RevisionParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer)
  n: number;

  @Field(() => Integer)
  r: number;
}

@Schema()
export class RunParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  runId: string;
}

@Schema()
export class RunCallParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  runId: string;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  callId: bigint;
}

// ─── Request bodies ───────────────────────────────────────────────────────────

@Schema()
export class SeedFromBriefBody {
  @Field()
  brief: string;

  @Field({ optional: true })
  force?: boolean;
}

@Schema()
export class PlanBody {
  @Field(() => Integer)
  volumeCount: number;

  @Field(() => Integer)
  chaptersPerVolume: number;

  @Field({ optional: true })
  skeleton?: string;
}

@Schema()
export class OutlineBody {
  @Field(() => Integer, { optional: true })
  count?: number;

  @Field(() => Integer, { optional: true })
  start?: number;

  @Field({ optional: true })
  context?: string;
}

@Schema()
export class UpdateBriefBody {
  @Field({ optional: true })
  title?: string;

  @Field()
  body: string;

  // Omitted → unchanged; the in-app path for adopting knowledge contracts on projects whose
  // prose already blocks an overwrite re-import (character-knowledge design §3).
  @Field(() => KnowledgeContractSchema, { optional: true })
  knowledgeContract?: KnowledgeContractSchema;
}

@Schema()
export class GenerateBody {
  @Field(() => Integer, { optional: true })
  limit?: number;

  @Field({ optional: true })
  autoFix?: boolean;

  @Field(() => Integer, { optional: true })
  maxFixes?: number;

  @Field({ optional: true })
  guidance?: string;
}

@Schema()
export class UpdateDraftBody {
  @Field({ optional: true })
  title?: string;

  @Field()
  body: string;

  @Field({ optional: true })
  summary?: string;

  // Opaque draft state snapshot produced by the generation graph; its keys vary by workflow, so it
  // stays an open object with `additionalProperties` to preserve them.
  @Field(() => Object, { optional: true, additionalProperties: true })
  state?: Record<string, unknown>;
}

@Schema()
export class ReviseDraftBody {
  @Field()
  note: string;
}

@Schema()
export class FeedbackBody {
  @Field()
  note: string;

  @Field(() => UserFeedbackDisposition, { optional: true })
  disposition?: Ai.UserFeedbackDisposition;
}

@Schema()
export class ApproveDraftBody {
  @Field({ optional: true })
  reviewerId?: string;

  @Field({ optional: true })
  idempotencyKey?: string;
}

@Schema()
export class ImportDraftBody {
  @Field()
  prose: string;

  @Field({ optional: true })
  title?: string;

  @Field({ optional: true })
  summary?: string;
}

@Schema()
export class FinalizeBody {
  @Field(() => Integer, { optional: true })
  chapter?: number;
}

@Schema()
export class GenerateGrokBody {
  @Field({ optional: true })
  guidance?: string;
}

@Schema()
export class UpdateContinuityBody {
  // A continuity proposal blob whose shape is set by the continuity model (findings + suggested edits);
  // kept as an open object with `additionalProperties` so its nested keys survive.
  @Field(() => Object, { additionalProperties: true })
  proposal: Record<string, unknown>;
}

@Schema()
export class SearchQuery {
  @Field()
  q: string;

  @Field({ optional: true })
  index?: 'prose' | 'lore' | 'both';

  @Field(() => Integer, { optional: true })
  k?: number;
}

// ─── Response schemas ─────────────────────────────────────────────────────────

@Schema()
export class WorkflowRunResponse {
  @Field()
  runId: string;

  @Field()
  outcome: string;

  @Field()
  status: string;
}

@Schema()
export class DraftResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => DraftStatus)
  status: Generation.DraftStatus;

  @Field(() => Integer)
  revision: number;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field({ optional: true, nullable: true })
  body: string;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  state?: Record<string, unknown> | null;

  @Field({ optional: true, nullable: true })
  volumeKey?: string | null;

  @Field(() => DraftReviewStatus)
  reviewStatus: Generation.DraftReviewStatus;

  @Field(() => String)
  generator: Generation.Draft['generator'];

  @Field(() => String, { optional: true, nullable: true })
  judge?: Generation.JudgeVerdict | null;

  @Field({ optional: true, nullable: true })
  judgeNote?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class BriefResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  volumeKey?: string | null;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field()
  body: string;

  // The retrieval refs a draft was built from — a list of artifact keys (see `BriefUpdateOp.contextRefs`).
  @Field(() => [String], { optional: true, nullable: true })
  contextRefs?: string[] | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

// A brief's identity + freshness, without its body — what the plan hierarchy lists per chapter.
@Schema()
export class BriefSummaryResponse {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  volumeKey?: string | null;

  @Field({ optional: true, nullable: true })
  arcKey?: string | null;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field({ optional: true, nullable: true })
  staleReason?: string | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListBriefSummaryResponse {
  @Field(() => [BriefSummaryResponse])
  items: BriefSummaryResponse[];
}

@Schema()
export class DraftRevisionResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  draftId: bigint;

  @Field(() => Integer)
  revision: number;

  @Field(() => DraftRevisionSource)
  source: Ai.DraftRevisionSource;

  @Field()
  body: string;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  state?: Record<string, unknown> | null;

  @Field({ optional: true, nullable: true })
  runId?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class UserFeedbackResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field()
  artifactType: string;

  @Field()
  artifactRef: string;

  @Field(() => UserFeedbackDisposition)
  disposition: Ai.UserFeedbackDisposition;

  @Field({ optional: true, nullable: true })
  note?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ContinuityProposalResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field()
  status: string;

  @Field(() => Object, { additionalProperties: true })
  proposal: Record<string, unknown>;

  @Field({ optional: true, nullable: true })
  model?: string | null;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  appliedAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class RunModelCallResponse {
  @Field(() => String)
  id: bigint;

  @Field({ optional: true, nullable: true })
  node?: string | null;

  @Field()
  role: string;

  @Field()
  provider: string;

  @Field()
  model: string;

  @Field()
  promptKey: string;

  @Field()
  promptVersion: string;

  @Field()
  status: string;

  @Field(() => Integer, { optional: true, nullable: true })
  inputTokens?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  outputTokens?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  latencyMs?: number | null;

  @Field({ optional: true, nullable: true })
  costUsd?: string | null;

  @Field(() => Integer)
  attempt: number;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

// A read-only lookup the model made mid-run (chat lookups, judge/validation tools) — args in full,
// result as a digest; the tokens the lookups added ride in the following model call's input.
@Schema()
export class RunToolCallResponse {
  @Field(() => String)
  id: bigint;

  @Field({ optional: true, nullable: true })
  node?: string | null;

  @Field()
  tool: string;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  args?: Record<string, unknown> | null;

  @Field()
  status: string;

  @Field({ optional: true, nullable: true })
  resultDigest?: string | null;

  @Field(() => Integer, { optional: true, nullable: true })
  latencyMs?: number | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class RunContextSectionItem {
  @Field()
  key: string;

  @Field()
  tier: string;

  @Field()
  segment: string;

  @Field(() => Integer)
  tokens: number;

  @Field()
  truncated: boolean;
}

// The prompt anatomy: where a run's input tokens actually come from — the assembled context pack's
// sections, not the user's message. This is the data for optimising token usage per purpose.
@Schema()
export class RunContextPackResponse {
  @Field()
  id: string;

  @Field()
  purpose: string;

  @Field(() => Integer, { optional: true, nullable: true })
  budgetTokens?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  usedTokens?: number | null;

  @Field(() => [RunContextSectionItem])
  sections: RunContextSectionItem[];
}

@Schema()
export class RunContextResponse extends RunContextPackResponse {
  // The exact rendered text that fed the prompt (stable + volatile, in order).
  @Field()
  rendered: string;
}

@Schema()
export class RunModelCallDetailResponse extends RunModelCallResponse {
  @Field({ optional: true, nullable: true })
  rawOutput?: string | null;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  error?: Record<string, unknown> | null;
}

@Schema()
export class WorkflowRunDetailResponse {
  @Field()
  id: string;

  @Field(() => String)
  projectId: bigint;

  @Field({ optional: true, nullable: true })
  jobId?: string | null;

  @Field()
  graph: string;

  @Field()
  target: string;

  @Field(() => WorkflowRunStatus)
  status: Ai.WorkflowRunStatus;

  @Field({ optional: true, nullable: true })
  outcome?: string | null;

  // `additionalProperties: true` keeps the nested run input/error intact; without it the response
  // serialiser strips every nested key and returns `{}` (an empty, useless "context input").
  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  input?: Record<string, unknown> | null;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  error?: Record<string, unknown> | null;

  @Field(() => [String], { optional: true, nullable: true })
  nodeTrace?: string[] | null;

  // Present only on the run-detail endpoint (the list omits it): every model call this run made.
  @Field(() => [RunModelCallResponse], { optional: true })
  modelCalls?: RunModelCallResponse[];

  // Present only on the run-detail endpoint: every tool lookup the run's model calls performed.
  @Field(() => [RunToolCallResponse], { optional: true })
  toolCalls?: RunToolCallResponse[];

  // Present only on the run-detail endpoint, when the run linked its pack: the prompt anatomy.
  // Optional, never null — the route serialiser cannot build nullable nested-object fields.
  @Field(() => RunContextPackResponse, { optional: true })
  contextPack?: RunContextPackResponse;

  @Field(() => String, { format: 'date-time' })
  startedAt: Date;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  endedAt?: Date | null;
}

// ─── Additional response schemas ──────────────────────────────────────────────

@Schema()
export class JobEnqueueResponse {
  @Field()
  jobId: string;

  @Field()
  kind: string;

  @Field()
  status: string;

  @Field()
  target: string;
}

@Schema()
export class PlanVolumeItem {
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

  @Field(() => PlanStatus)
  status: string;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class PlanResponse {
  @Field(() => [PlanVolumeItem])
  volumes: PlanVolumeItem[];
}

@Schema()
export class ApprovePlanResponse {
  @Field(() => Integer)
  volumesApproved: number;

  @Field()
  approved: boolean;
}

@Schema()
export class OutlineResponse {
  @Field(() => [BriefResponse])
  briefs: BriefResponse[];
}

@Schema()
export class ListDraftResponse {
  @Field(() => [DraftResponse])
  items: DraftResponse[];
}

@Schema()
export class JudgeFindingResponse {
  @Field()
  severity: string;

  @Field()
  text: string;
}

@Schema()
export class JudgeResponse {
  @Field()
  verdict: string;

  @Field(() => [JudgeFindingResponse])
  findings: JudgeFindingResponse[];
}

@Schema()
export class ListDraftRevisionResponse {
  @Field(() => [DraftRevisionResponse])
  items: DraftRevisionResponse[];
}

@Schema()
export class MarkdownResponse {
  @Field()
  markdown: string;
}

@Schema()
export class ChapterReviewResponse {
  @Field()
  disposition: string;

  @Field({ optional: true, nullable: true })
  note?: string | null;

  @Field(() => [JudgeFindingResponse], { optional: true, nullable: true })
  findings?: JudgeFindingResponse[] | null;
}

@Schema()
export class ReviewQueueResponse {
  @Field(() => [DraftResponse])
  drafts: DraftResponse[];

  @Field(() => [ContinuityProposalResponse])
  proposals: ContinuityProposalResponse[];
}

@Schema()
export class ListWorkflowRunResponse {
  @Field(() => [WorkflowRunDetailResponse])
  items: WorkflowRunDetailResponse[];
}

// A per-role model-call-count map: keys are the open `AiRole` vocabulary, values are integers.
// `patternProperties` types the values (the normaliser rewrites refs under patternProperties, unlike
// `additionalProperties`), while still allowing any role key.
@Schema({ patternProperties: { '^[a-z_]+$': Integer } })
export class RoleCallCounts {}

// Per-role usage row: `role` is the open AiRole vocabulary (may contain `:`/`-`, e.g. `bible:plot`),
// so it stays a plain string rather than a pattern-keyed map.
@Schema()
export class RoleUsage {
  @Field()
  role: string;

  @Field(() => Integer)
  calls: number;

  @Field(() => Integer)
  inputTokens: number;

  @Field(() => Integer)
  outputTokens: number;

  @Field()
  costUsd: number;
}

@Schema()
export class AiUsageResponse {
  @Field(() => Integer)
  totalInputTokens: number;

  @Field(() => Integer)
  totalOutputTokens: number;

  @Field()
  totalCostUsd: number;

  @Field(() => RoleCallCounts)
  callsPerRole: RoleCallCounts;

  // Per-role breakdown (calls + tokens + cost), sorted by total tokens descending.
  @Field(() => [RoleUsage])
  roles: RoleUsage[];
}

@Schema()
export class SearchHitResponse {
  @Field()
  text: string;

  @Field()
  score: number;

  // Per-hit vector metadata (source refs, chunk info) — an open map from the index, so it keeps
  // `additionalProperties` to preserve every key through serialisation.
  @Field(() => Object, { additionalProperties: true })
  metadata: Record<string, unknown>;
}

@Schema()
export class SearchResponse {
  @Field(() => [SearchHitResponse])
  hits: SearchHitResponse[];
}

@Schema()
export class GenerationJobItem {
  @Field()
  id: string;

  @Field(() => String)
  projectId: bigint;

  @Field(() => JobKind)
  kind: string;

  @Field()
  target: string;

  @Field(() => JobStatus)
  status: string;

  @Field(() => Integer)
  attempts: number;

  @Field({ optional: true, nullable: true })
  lastError?: string | null;

  // `additionalProperties: true` keeps the nested keys; without it the serialiser strips them to `{}`.
  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  payload?: unknown;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  progress?: unknown;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListGenerationJobResponse {
  @Field(() => [GenerationJobItem])
  items: GenerationJobItem[];
}

// ─── Chapter scene images ─────────────────────────────────────────────────────

@Schema()
export class ChapterImageParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer)
  n: number;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  imageId: bigint;
}

@Schema()
export class AddChapterImageBody {
  @Field(() => String, { enum: ['image/png', 'image/jpeg', 'image/webp'] })
  mime: 'image/png' | 'image/jpeg' | 'image/webp';

  // Base64-encoded image bytes, without the `data:` URL prefix.
  @Field()
  image: string;

  @Field({ optional: true })
  caption?: string;
}

@Schema()
export class ChapterImageResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => Integer)
  chapter: number;

  // Absolute public object-storage URL, resolved server-side from the runtime `storage.public-origin`.
  @Field()
  imageUrl: string;

  @Field({ optional: true, nullable: true })
  caption?: string | null;

  @Field(() => Integer)
  sortOrder: number;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListChapterImageResponse {
  @Field(() => [ChapterImageResponse])
  items: ChapterImageResponse[];
}
