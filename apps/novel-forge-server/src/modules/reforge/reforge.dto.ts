import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import {
  ReforgeAnalysisStatus,
  ReforgeChapterStatus,
  ReforgeCutDisposition,
  ReforgeCutKind,
  ReforgeFidelity,
  ReforgeFindingSource,
  ReforgeFindingType,
  ReforgeMode,
  ReforgeOutputStatus,
  ReforgePlanStatus,
  ReforgeSpanAction,
  ReforgeStatus,
} from '@server/common';

@Schema()
export class ReforgeParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class ReforgeChapterParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer, { minimum: 1 })
  chapter: number;
}

@Schema()
export class ReforgeSettingsBody {
  @Field({ optional: true })
  judgeEnabled?: boolean;

  @Field(() => Integer, { optional: true, minimum: 1 })
  targetWords?: number;

  @Field(() => Integer, { optional: true, minimum: 1, maximum: 50, description: 'Transform mode: source chapters per analysis window (default 15).' })
  analysisWindow?: number;

  @Field({ optional: true, minimum: 0.2, maximum: 1, description: 'Transform mode: whole-novel length ratio the plan drafter aims for — a hint, never a per-span rule.' })
  targetCompression?: number;

  @Field(() => Integer, { optional: true, minimum: 1, description: 'Transform mode: shortest span the plan may contain (default 1).' })
  minSpanChapters?: number;

  @Field(() => Integer, { optional: true, minimum: 1, description: 'Transform mode: source chapters one output chapter may be written from (default 6).' })
  maxSpanSourceChapters?: number;
}

@Schema()
export class ReforgeConfigBody {
  @Field({ optional: true, nullable: true })
  instructions?: string | null;

  @Field(() => ReforgeFidelity, { optional: true })
  fidelity?: 'preserve' | 'close' | 'loose';

  @Field(() => ReforgeMode, { optional: true, description: 'chapter = the 1:1 re-author; transform = the plan-driven structural mode, which forces fidelity: loose.' })
  mode?: 'chapter' | 'transform';

  @Field(() => ReforgeSettingsBody, { optional: true })
  settings?: ReforgeSettingsBody;
}

@Schema()
export class ReforgeStartBody {
  @Field({ optional: true })
  force?: boolean;

  @Field(() => Integer, { optional: true, minimum: 1 })
  limit?: number;
}

@Schema()
export class ReforgeResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => ReforgeStatus)
  status: string;

  @Field({ optional: true, nullable: true })
  instructions?: string | null;

  @Field(() => ReforgeFidelity)
  fidelity: string;

  @Field(() => ReforgeMode)
  mode: string;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Settings used for this reforge run.' })
  settings?: ReforgeSettingsBody | null;

  @Field({ optional: true, nullable: true })
  lastError?: string | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ReforgeCountsResponse {
  @Field(() => Integer)
  reforged: number;

  @Field(() => Integer)
  attention: number;

  @Field(() => Integer)
  failed: number;
}

@Schema()
export class ReforgeOutputCountsResponse {
  @Field(() => Integer)
  written: number;

  @Field(() => Integer)
  attention: number;

  @Field(() => Integer)
  failed: number;
}

@Schema()
export class ReforgePlanHeaderResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => Integer)
  revision: number;

  @Field(() => ReforgePlanStatus)
  status: string;

  @Field(() => Integer)
  sourceChapterCount: number;

  @Field(() => Integer)
  outputChapterCount: number;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  approvedAt?: Date | null;

  @Field(() => String, { optional: true, nullable: true })
  promotedProjectId?: bigint | null;
}

@Schema()
export class ReforgeTransformStatusResponse {
  @Field(() => ReforgePlanHeaderResponse, { optional: true, description: 'The newest plan revision; outputs under an older one are stale.' })
  plan?: ReforgePlanHeaderResponse;

  @Field(() => ReforgeOutputCountsResponse)
  counts: ReforgeOutputCountsResponse;

  @Field(() => Integer)
  cuts: number;
}

@Schema()
export class ReforgeStatusResponse {
  @Field(() => ReforgeResponse)
  reforge: ReforgeResponse;

  @Field(() => Integer)
  sourceChapters: number;

  @Field(() => Integer)
  glossaryCount: number;

  @Field(() => ReforgeCountsResponse)
  counts: ReforgeCountsResponse;

  @Field(() => Object, {
    optional: true,
    nullable: true,
    additionalProperties: true,
    description: 'Latest reforge job, including its job-specific progress fields.',
  })
  job?: unknown;

  @Field(() => ReforgeTransformStatusResponse, { optional: true, description: 'Present only in transform mode — the plan, its outputs, and its cut ledger.' })
  transform?: ReforgeTransformStatusResponse;
}

@Schema({ additionalProperties: true, description: 'Model-reported audit issue whose fields vary by source.' })
export class ReforgeDetailItem {
  @Field({ optional: true })
  detail?: string;
}

@Schema()
export class ReforgeChapterResponse {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field()
  body: string;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field(() => Object, {
    optional: true,
    nullable: true,
    additionalProperties: true,
    description: 'Faithful outline used by the reforge writer.',
  })
  sourceBeats?: unknown;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Changes applied by the reforge writer.' })
  changes?: unknown;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Fidelity assessment for the reforge output.' })
  fidelity?: unknown;

  @Field(() => [ReforgeDetailItem], { optional: true, nullable: true })
  issues?: unknown;

  @Field(() => ReforgeChapterStatus)
  status: string;

  @Field(() => Integer, { optional: true, nullable: true })
  wordCount?: number | null;

  @Field(() => Integer)
  revision: number;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ReforgeSummaryResponse {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => ReforgeChapterStatus)
  status: string;

  @Field(() => Integer)
  issueCount: number;

  @Field(() => Integer, { optional: true, nullable: true })
  wordCount?: number | null;

  @Field(() => Integer)
  revision: number;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListReforgesResponse {
  @Field(() => [ReforgeSummaryResponse])
  items: ReforgeSummaryResponse[];
}

@Schema()
export class ReforgeManuscriptResponse {
  @Field()
  markdown: string;
}

@Schema()
export class ReforgeAnalysisMetricsResponse {
  @Field({ description: 'Share of source chapters that reuse scene material found elsewhere in the novel.' })
  repetitionRatio: number;

  @Field({ description: 'Share of source chapters the reading pass rated as not moving the story.' })
  stallRatio: number;

  @Field(() => Integer)
  medianWords: number;

  @Field(() => Integer)
  arcCount: number;

  @Field(() => Integer)
  deadThreadCount: number;
}

@Schema()
export class ReforgeAnalysisResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => ReforgeAnalysisStatus)
  status: string;

  @Field(() => Integer)
  windowSize: number;

  @Field(() => Integer)
  chaptersAnalyzed: number;

  @Field(() => Integer, { description: 'Windows that failed and were flagged rather than aborting the run.' })
  windowsFailed: number;

  @Field(() => ReforgeAnalysisMetricsResponse, { optional: true })
  metrics?: ReforgeAnalysisMetricsResponse;

  @Field({ optional: true, nullable: true })
  lastError?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ReforgeAnalysisStatusResponse {
  @Field(() => ReforgeAnalysisResponse)
  analysis: ReforgeAnalysisResponse;

  @Field(() => Object, { additionalProperties: true, description: 'Finding count per finding type.' })
  findingCounts: Record<string, number>;
}

@Schema()
export class ReforgeReportResponse {
  @Field()
  markdown: string;
}

@Schema()
export class ReforgeFindingResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => ReforgeFindingType)
  type: string;

  @Field(() => Integer)
  fromChapter: number;

  @Field(() => Integer)
  toChapter: number;

  @Field(() => Integer)
  severity: number;

  @Field()
  confidence: number;

  @Field(() => ReforgeFindingSource, { description: 'signal = mechanical only, model = reading pass only, both = the reading pass confirmed a signal.' })
  detectedBy: string;

  @Field()
  label: string;

  @Field({ optional: true, nullable: true })
  detail?: string | null;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Detector evidence behind the finding.' })
  evidence?: unknown;
}

@Schema()
export class ReforgeFindingsQuery {
  @Field(() => ReforgeFindingType, { optional: true })
  type?: string;

  @Field(() => Integer, { optional: true, minimum: 1, maximum: 5 })
  minSeverity?: number;

  @Field(() => Integer, { optional: true, minimum: 1 })
  page?: number;

  @Field(() => Integer, { optional: true, minimum: 1, maximum: 200 })
  limit?: number;
}

@Schema()
export class ListReforgeFindingsResponse {
  @Field(() => [ReforgeFindingResponse])
  items: ReforgeFindingResponse[];

  @Field(() => Integer)
  total: number;
}

@Schema()
export class ReforgePlanSpanBody {
  @Field(() => Integer, { minimum: 1 })
  ordinal: number;

  @Field(() => Integer, { minimum: 1 })
  fromChapter: number;

  @Field(() => Integer, { minimum: 1 })
  toChapter: number;

  @Field(() => ReforgeSpanAction)
  action: 'keep' | 'condense' | 'merge' | 'drop';

  @Field(() => Integer, { minimum: 0, description: 'Output chapters this span produces; 0 only for a drop.' })
  targetChapters: number;

  @Field({ optional: true, nullable: true })
  arcLabel?: string | null;

  @Field({ optional: true, nullable: true })
  rationale?: string | null;

  @Field(() => [String], { optional: true, nullable: true, description: 'Beats every output chapter of this span owes — the judge’s contract.' })
  keptBeats?: string[] | null;

  @Field(() => [String], { optional: true, nullable: true, description: 'Threads this span removes; each seeds a cut-ledger entry at approval.' })
  cutThreads?: string[] | null;

  @Field({ optional: true, nullable: true, description: 'Required on a span that follows a dropped span — the bridge across the seam.' })
  continuityNotes?: string | null;

  @Field(() => [String], { optional: true, nullable: true })
  findingIds?: string[] | null;
}

@Schema()
export class ReforgePlanSpansBody {
  @Field(() => [ReforgePlanSpanBody], { minItems: 1 })
  spans: ReforgePlanSpanBody[];

  @Field(() => Integer, { optional: true, minimum: 1, description: 'The plan revision this edit was made against; a mismatch 409s rather than overwriting a newer one.' })
  baseRevision?: number;
}

@Schema()
export class ReforgePlanApproveBody {
  @Field(() => Integer, { optional: true, minimum: 1, description: 'The plan revision being approved; a mismatch 409s rather than approving a plan the author never read.' })
  baseRevision?: number;
}

@Schema()
export class ReforgePlanSpanResponse extends ReforgePlanSpanBody {
  @Field(() => String, { description: 'Stable across revisions that leave the span’s bounds, action, and target untouched.' })
  spanKey: string;

  @Field(() => Integer, { optional: true, nullable: true, description: 'First output chapter this span produces; null for a drop.' })
  firstOutputChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  lastOutputChapter?: number | null;
}

@Schema()
export class ReforgePlanResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => Integer)
  revision: number;

  @Field(() => ReforgePlanStatus)
  status: string;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field(() => Integer)
  sourceChapterCount: number;

  @Field(() => Integer)
  outputChapterCount: number;

  @Field(() => String, { optional: true, nullable: true })
  promotedProjectId?: bigint | null;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  approvedAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ReforgeOutputParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer, { minimum: 1 })
  outputChapter: number;
}

@Schema()
export class ReforgeTransformStartBody {
  @Field(() => [Integer], { optional: true, minItems: 1, description: 'Output chapters to write; omitted means every output the plan derives that is not written yet.' })
  outputs?: number[];

  @Field({ optional: true, description: 'Rewrite outputs that already landed instead of only the missing ones.' })
  force?: boolean;

  @Field(() => Integer, { optional: true, minimum: 1, description: 'Cap on outputs written in this run — a trial before committing the book.' })
  limit?: number;
}

@Schema()
export class ReforgePromoteBody {
  @Field({ optional: true, description: 'Title of the promoted project; defaults to the source project’s.' })
  title?: string;

  @Field({ optional: true, description: 'Write the plan’s arc boundaries as volumes so the promoted project is immediately plannable.' })
  seedVolumes?: boolean;
}

@Schema()
export class ReforgeOutputSummaryResponse {
  @Field(() => Integer)
  outputChapter: number;

  @Field(() => Integer)
  spanOrdinal: number;

  @Field(() => Integer)
  fromChapter: number;

  @Field(() => Integer)
  toChapter: number;

  @Field(() => Integer, { description: '0-based slice of a condensed span.' })
  indexInSpan: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => ReforgeOutputStatus)
  status: string;

  @Field(() => Integer)
  issueCount: number;

  @Field(() => Integer, { optional: true, nullable: true })
  wordCount?: number | null;

  @Field(() => Integer)
  revision: number;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListReforgeOutputsResponse {
  @Field(() => [ReforgeOutputSummaryResponse])
  items: ReforgeOutputSummaryResponse[];
}

@Schema()
export class ReforgeOutputResponse {
  @Field(() => Integer)
  outputChapter: number;

  @Field(() => Integer)
  spanOrdinal: number;

  @Field(() => Integer)
  fromChapter: number;

  @Field(() => Integer)
  toChapter: number;

  @Field(() => Integer)
  indexInSpan: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => ReforgeOutputStatus)
  status: string;

  @Field(() => Integer, { optional: true, nullable: true })
  wordCount?: number | null;

  @Field(() => Integer)
  revision: number;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;

  @Field()
  body: string;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field(() => [String], { optional: true, nullable: true, description: 'The kept beats this chapter owed — the judge’s contract.' })
  planBeats?: unknown;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Changes the transform writer reported.' })
  changes?: unknown;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Plan-contract assessment from the transform judge.' })
  fidelity?: unknown;

  @Field(() => [ReforgeDetailItem], { optional: true, nullable: true })
  issues?: unknown;
}

@Schema()
export class ReforgeCutResponse {
  @Field()
  cutKey: string;

  @Field(() => ReforgeCutKind)
  kind: string;

  @Field()
  label: string;

  @Field(() => [String], { optional: true, nullable: true })
  aliases?: string[] | null;

  @Field({ optional: true, nullable: true })
  detail?: string | null;

  @Field(() => ReforgeCutDisposition)
  disposition: string;

  @Field({ optional: true, nullable: true })
  replacementNote?: string | null;

  @Field(() => Integer)
  originSpanOrdinal: number;

  @Field(() => Integer)
  firstSourceChapter: number;

  @Field(() => Integer)
  lastSourceChapter: number;

  @Field(() => Integer, { description: 'The cut never resurfaces at or after this output chapter.' })
  effectiveFromOutput: number;
}

@Schema()
export class ListReforgeCutsResponse {
  @Field(() => [ReforgeCutResponse])
  items: ReforgeCutResponse[];
}

@Schema()
export class ReforgePlanDetailResponse {
  @Field(() => ReforgePlanResponse)
  plan: ReforgePlanResponse;

  @Field(() => [ReforgePlanSpanResponse])
  spans: ReforgePlanSpanResponse[];

  @Field(() => Integer, { description: 'Derived from the running sum of targetChapters — never authored.' })
  outputChapterCount: number;
}
