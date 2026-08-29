import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { type DarkContentLevel, type SexualContentLevel, type ViolenceLevel } from '@shadow-library/sdk';

import {
  DarkContentRating,
  DraftReviewStatus,
  DraftRevisionSource,
  DraftStatus,
  JobKind,
  JobStatus,
  PlanStatus,
  SexualContentRating,
  UserFeedbackDisposition,
  ViolenceRating,
  WorkflowRunStatus,
} from '@server/common';
import { type Ai, type Generation } from '@server/database';

import { KnowledgeContractSchema } from '../ai/schemas';

const RATING_DESCRIPTION = 'Content rating level; an omitted dimension is unrated — never send "none" to say it.';

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
export class ContentRatingInput {
  @Field(() => SexualContentRating, { optional: true, description: RATING_DESCRIPTION })
  sexualContent?: SexualContentLevel;

  @Field(() => ViolenceRating, { optional: true, description: RATING_DESCRIPTION })
  violence?: ViolenceLevel;

  @Field(() => DarkContentRating, { optional: true, description: RATING_DESCRIPTION })
  darkContent?: DarkContentLevel;
}

@Schema()
export class ImportDraftBody {
  @Field()
  prose: string;

  @Field({ optional: true })
  title?: string;

  @Field({ optional: true })
  summary?: string;

  @Field(() => ContentRatingInput, { optional: true, description: 'Rating of the pasted prose; omission keeps the stored rating, an empty object clears it back to unrated.' })
  contentRating?: ContentRatingInput;

  @Field(() => Object, { additionalProperties: true, optional: true, description: 'Continuation state the next chapter builds on; omission keeps the stored state.' })
  state?: Record<string, unknown>;

  @Field({
    optional: true,
    description:
      'Firewalls this prose from the vector index, continuity extraction, and the verbatim-prose adjacency rule. Omission keeps the stored value — send false to lift an existing firewall.',
  })
  isolated?: boolean;
}

@Schema()
export class FinalizeBody {
  @Field(() => Integer, { optional: true })
  chapter?: number;
}

@Schema()
export class GenerateUnrestrictedBody {
  @Field({ optional: true })
  guidance?: string;

  @Field(() => ContentRatingInput, { optional: true, description: 'Rating of the generated prose; omission keeps the stored rating, an empty object clears it back to unrated.' })
  contentRating?: ContentRatingInput;
}

@Schema()
export class ChapterSummarizeResponse {
  @Field({ minLength: 1, description: '2-3 sentence summary of what happened in the chapter, past tense — not persisted until saved through PUT /drafts/:n.' })
  summary: string;

  @Field(() => Object, { additionalProperties: true, description: 'Continuation state the next chapter would build on — review and edit before saving through PUT /drafts/:n.' })
  state: Record<string, unknown>;
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

  @Field(() => Integer, {
    optional: true,
    description: 'Present when the batch was cut short of its limit: this chapter is an external-write slot that must be filled by hand before generation continues past it.',
  })
  stoppedAtExternalChapter?: number;
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

@Schema()
export class ChapterInsertParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer, { minimum: 0, description: 'Insert the new chapter immediately after this number; 0 inserts ahead of chapter 1.' })
  afterChapter: number;
}

@Schema()
export class InsertChapterBody {
  @Field(() => String, { enum: ['hand', 'planner'], description: "'hand' takes briefBody verbatim; 'planner' drafts the brief from intent." })
  briefOrigin: 'hand' | 'planner';

  @Field({ optional: true, description: "The brief body to store verbatim. Required when briefOrigin is 'hand'." })
  briefBody?: string;

  @Field({ optional: true, description: "One line describing what the inserted chapter must do. Required when briefOrigin is 'planner'." })
  intent?: string;
}

@Schema({ description: 'The brief created in the freed slot, plus the extent of the renumber that freed it.' })
export class InsertChapterResponse {
  @Field(() => BriefResponse)
  brief: BriefResponse;

  @Field(() => Integer, { description: 'Number the inserted chapter now occupies.' })
  newChapter: number;

  @Field(() => Integer, { description: 'How many briefs the insert renumbered.' })
  shiftedChapters: number;
}
