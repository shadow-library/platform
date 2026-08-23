import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { DraftReviewStatus, DraftRevisionSource, DraftStatus, JobKind, JobStatus, PlanStatus, UserFeedbackDisposition, WorkflowRunStatus } from '@server/common';
import { type Ai, type Generation } from '@server/database';

import { KnowledgeContractSchema } from '../ai/schemas';

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

  @Field(() => KnowledgeContractSchema, { optional: true, description: 'Replacement knowledge contract. Omit to leave the existing contract unchanged.' })
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

  @Field(() => Object, { optional: true, additionalProperties: true, description: 'Opaque workflow-specific draft state produced by the generation graph.' })
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
  @Field(() => Object, { additionalProperties: true, description: 'Continuity findings and suggested edits produced by the continuity model.' })
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

  @Field({ optional: true, nullable: true })
  staleReason?: string | null;

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

  @Field(() => [String], { optional: true, nullable: true, description: 'Artifact keys for the retrieval context used to build this draft.' })
  contextRefs?: string[] | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema({ description: "A brief's identity and freshness without its body." })
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

@Schema({ description: 'A read-only lookup performed by a model during a run.' })
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

@Schema({ description: "The context sections that contributed to a run's prompt token usage." })
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
  @Field({ description: 'The exact stable and volatile context text supplied to the prompt, in order.' })
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

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Workflow-specific input captured for this run.' })
  input?: Record<string, unknown> | null;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  error?: Record<string, unknown> | null;

  @Field(() => [String], { optional: true, nullable: true })
  nodeTrace?: string[] | null;

  @Field(() => [RunModelCallResponse], { optional: true, description: 'Model calls made by this run. Included only by the run-detail endpoint.' })
  modelCalls?: RunModelCallResponse[];

  @Field(() => [RunToolCallResponse], { optional: true, description: 'Tool lookups performed by this run. Included only by the run-detail endpoint.' })
  toolCalls?: RunToolCallResponse[];

  @Field(() => RunContextPackResponse, { optional: true, description: 'Prompt context breakdown. Included only by the run-detail endpoint when linked.' })
  contextPack?: RunContextPackResponse;

  @Field(() => String, { format: 'date-time' })
  startedAt: Date;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  endedAt?: Date | null;
}

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

@Schema({ description: 'Model call counts keyed by AI role.', patternProperties: { '^[a-z_]+$': Integer } })
export class RoleCallCounts {}

@Schema()
export class RoleUsage {
  @Field({ description: "An AI role identifier, including scoped roles such as 'bible:plot'." })
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

  @Field(() => [RoleUsage], { description: 'Per-role usage sorted by total token count in descending order.' })
  roles: RoleUsage[];
}

@Schema()
export class SearchHitResponse {
  @Field()
  text: string;

  @Field()
  score: number;

  @Field(() => Object, { additionalProperties: true, description: 'Index-specific vector metadata, including source references and chunk information.' })
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

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Event-specific payload.' })
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

  @Field({ description: 'Base64-encoded image bytes without a data URL prefix.' })
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

  @Field({ description: 'Absolute public URL for the stored scene image.' })
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
