import { EnumType, Field, Integer, OmitType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { ContentMode, CostSource, CostTier, SortByTime, WorkflowRunStatus } from '@server/common';
import { type Ai, type Project } from '@server/database';

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
class RunModelCallResponse {
  @Field(() => String)
  id: bigint;

  @Field({ optional: true, nullable: true })
  node?: string | null;

  @Field()
  role: string;

  @Field()
  provider: string;

  @Field({ description: 'The model that answered, as recorded: a catalog model, or its task when no model answered. Named by `GET /ai/models/admin` `modelLabels`.' })
  model: string;

  @Field()
  promptKey: string;

  @Field()
  promptVersion: string;

  @Field()
  status: string;

  @Field(() => Integer, { optional: true, nullable: true })
  inputTokens?: number | null;

  @Field(() => Integer, {
    optional: true,
    nullable: true,
    description: 'The share of inputTokens served from a provider cache; null when the provider reported no cache accounting.',
  })
  cachedInputTokens?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  outputTokens?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  latencyMs?: number | null;

  @Field({ optional: true, nullable: true })
  costUsd?: string | null;

  @Field(() => CostSource, { optional: true, nullable: true, description: 'Where costUsd came from; null on a row written before cost_source existed.' })
  costSource?: Ai.CostSource | null;

  @Field(() => CostTier, { optional: true, nullable: true, description: 'The cost tier this call ran under; null when the call predates tier tracking.' })
  tier?: Project.CostTier | null;

  @Field(() => ContentMode, { optional: true, nullable: true })
  contentMode?: Project.ContentMode | null;

  @Field(() => String, { optional: true, nullable: true, description: 'Reasoning effort sent with the call; null when the call sent none or predates effort tracking.' })
  reasoningEffort?: string | null;

  @Field(() => Integer)
  attempt: number;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema({ description: 'A read-only lookup performed by a model during a run.' })
class RunToolCallResponse {
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
class RunContextSectionItem {
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
class RunContextPackResponse {
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

@Schema({ description: "Spend split by where the cost came from — 'provider', 'gateway', 'estimate', or 'error' for a call that recorded none." })
class RunCostSourceItem {
  @Field()
  costSource: string;

  @Field(() => Integer)
  calls: number;

  @Field()
  costUsd: number;
}

@Schema({ description: "A workflow run's cost, tokens and call totals — the author-facing figure, never the prompt or response bodies behind it." })
export class RunUsageResponse {
  @Field(() => Integer)
  calls: number;

  @Field(() => Integer)
  inputTokens: number;

  @Field(() => Integer)
  cachedInputTokens: number;

  @Field(() => Integer)
  outputTokens: number;

  @Field({ description: 'Recorded cost plus the list-price estimate for calls that recorded none.' })
  costUsd: number;

  @Field({ description: 'The part of costUsd estimated from list prices because the call recorded no cost.' })
  estimatedCostUsd: number;

  @Field(() => Integer, { optional: true, nullable: true, description: 'Wall-clock milliseconds from startedAt to endedAt; null while the run is still in progress.' })
  durationMs?: number | null;

  @Field(() => [RunCostSourceItem])
  byCostSource: RunCostSourceItem[];
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

  @Field(() => [String], { description: 'Bible-builder only: stages this run left untouched because their document already had content. Empty for every other graph.' })
  skippedStages: string[];

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

  @Field(() => RunUsageResponse)
  totals: RunUsageResponse;
}

@Schema({ description: 'The non-admin-safe projection of a workflow run: identity, status and timing, never its input, error or context pack.' })
class WorkflowRunSummaryResponse {
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

  @Field(() => [String], { description: 'Bible-builder only: stages this run left untouched because their document already had content. Empty for every other graph.' })
  skippedStages: string[];

  @Field(() => String, { format: 'date-time' })
  startedAt: Date;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  endedAt?: Date | null;
}

@Schema()
class WorkflowRunListItemResponse extends WorkflowRunSummaryResponse {
  @Field(() => RunUsageResponse)
  totals: RunUsageResponse;
}

/**
 * Graphs the author asked for, directly or as a pipeline they started — everything `listRuns` surfaces.
 * An allowlist rather than a denylist of background graphs (`chat-title`, `chat-compact` —
 * fire-and-forget metadata graphs no `turn()` caller awaits or reports through) because a
 * forgotten entry then fails closed: a new background graph stays off this list by default and never
 * leaks into the runs rail, where a forgotten denylist entry fails open exactly as `chat-title` did.
 */
export const AUTHOR_FACING_GRAPHS = [
  'chat-turn',
  'premise-enhance',
  'bible-audit',
  'illustration',
  'chapter-generation',
  'chapter-finalization',
  'chapter-review',
  'bible-builder',
  'novel-validation',
] as const;

const RunGraph = EnumType.create('RunGraph', [...AUTHOR_FACING_GRAPHS]);

@Schema()
export class ListRunsQuery extends OmitType(PaginationQuery(SortByTime, { limit: 20 }, { maximumLimit: 100 }), ['sortBy', 'sortOrder'] as const) {
  @Field(() => RunGraph, { optional: true })
  graph?: (typeof AUTHOR_FACING_GRAPHS)[number];

  @Field(() => String, { optional: true, description: 'Only runs started at or after this ISO 8601 time.' })
  @Transform('date:parse')
  from?: Date;

  @Field(() => String, { optional: true, description: 'Only runs started at or before this ISO 8601 time.' })
  @Transform('date:parse')
  to?: Date;
}

@Schema({ description: "One model call as its run's usage shows it: its tokens and spend for everyone; the model, provider and reasoning effort for an admin only." })
class RunUsageCallResponse extends OmitType(RunModelCallResponse, ['provider', 'model', 'reasoningEffort'] as const) {
  @Field({ optional: true, description: 'Admin-only; omitted for everyone else.' })
  provider?: string;

  @Field({ optional: true, description: 'Admin-only; omitted for everyone else. The model that answered, as recorded, named by `GET /ai/models/admin` `modelLabels`.' })
  model?: string;

  @Field(() => String, { optional: true, nullable: true, description: 'Admin-only, since it hints at the model; omitted for everyone else. Null when the call sent none.' })
  reasoningEffort?: string | null;

  @Field({ description: 'Recorded cost plus the list-price estimate when the call recorded none.' })
  chargeUsd: number;

  @Field({ description: 'The part of chargeUsd estimated from list prices because the call recorded no cost.' })
  estimatedChargeUsd: number;
}

@Schema({ description: "A workflow run's model calls, without prompt, context or raw output — that detail stays admin-only." })
export class RunUsageDetailResponse extends WorkflowRunSummaryResponse {
  @Field(() => RunUsageResponse)
  totals: RunUsageResponse;

  @Field(() => [RunUsageCallResponse])
  calls: RunUsageCallResponse[];
}

@Schema({ description: "Spend under one internal call role ('generation', 'judge', 'review', 'revision', 'continuity', 'chapter-extract', 'chapter-summarize', …)." })
class ChapterCostBreakdownItem {
  @Field()
  role: string;

  @Field(() => Integer)
  calls: number;

  @Field()
  costUsd: number;
}

@Schema({ description: 'Every model call any action has made against one chapter — generation, judging, review, revision, continuity and extraction alike.' })
export class ChapterCostResponse {
  @Field(() => Integer)
  chapter: number;

  @Field(() => RunUsageResponse)
  totals: RunUsageResponse;

  @Field(() => [ChapterCostBreakdownItem], { description: 'By internal call role, highest spend first.' })
  byRole: ChapterCostBreakdownItem[];
}

@Schema()
export class ListWorkflowRunResponse extends Paginated(WorkflowRunListItemResponse) {}
