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
import { ReforgeChapterStatus, ReforgeFidelity, ReforgeStatus } from '@server/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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

  // Settings mirror ReforgeSettingsBody but ride out as an open jsonb blob (nullable class refs
  // don't serialise; same treatment as jobs.payload).
  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
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

  // The latest reforge job, if any — shape mirrors JobResponse but stays open for the progress blob.
  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  job?: unknown;
}

// A model-reported audit-trail entry (issue) — an open shape whose keys vary by source;
// `additionalProperties` keeps every nested key through serialisation.
@Schema({ additionalProperties: true })
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

  // The faithful outline the writer worked from, the applied changes, and the judge verdict — all open
  // model-produced jsonb blobs, so they ride out with additionalProperties.
  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  sourceBeats?: unknown;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  changes?: unknown;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
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
