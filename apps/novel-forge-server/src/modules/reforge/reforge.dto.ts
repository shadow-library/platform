import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { ReforgeAnalysisStatus, ReforgeChapterStatus, ReforgeFidelity, ReforgeFindingSource, ReforgeFindingType, ReforgeStatus } from '@server/common';

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
}

@Schema()
export class ReforgeConfigBody {
  @Field({ optional: true, nullable: true })
  instructions?: string | null;

  @Field(() => ReforgeFidelity, { optional: true })
  fidelity?: 'preserve' | 'close' | 'loose';

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

  @Field(() => ReforgeAnalysisMetricsResponse, { optional: true, nullable: true })
  metrics?: ReforgeAnalysisMetricsResponse | null;

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
