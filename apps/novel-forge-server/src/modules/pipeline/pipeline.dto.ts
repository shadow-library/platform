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

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class PipelineProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class IngestBody {
  @Field(() => Integer, { optional: true })
  limit?: number;

  @Field(() => Integer, { optional: true })
  delayMs?: number;
}

@Schema()
export class ExtractBody {
  @Field(() => Integer, { optional: true })
  limit?: number;

  @Field({ optional: true })
  rearm?: boolean;
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
export class ConsolidateResponse {
  @Field(() => Integer)
  significanceUpdated: number;

  @Field(() => Integer)
  relationshipsPromoted: number;
}

@Schema()
export class AssetsResponse {
  @Field()
  markdown: string;
}

@Schema()
export class SkeletonResponse {
  // Source-derived skeleton of each character's arc — an open, model-produced map with no fixed key
  // set, so it stays an object with `additionalProperties` to preserve every nested key.
  @Field(() => Object, { additionalProperties: true })
  characterArcs: unknown;

  @Field()
  powerCurve: string;
}

@Schema()
export class ResumeResponse {
  @Field()
  jobId: string;
}

@Schema()
export class RecombineBody {
  @Field({ optional: true })
  dryRun?: boolean;

  @Field({ optional: true })
  useAi?: boolean;
}

@Schema()
export class MergedChapterItem {
  @Field(() => Integer)
  number: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => Integer)
  parts: number;
}

@Schema()
export class AmbiguousBoundaryItem {
  @Field(() => Integer)
  afterNumber: number;

  @Field()
  reason: string;
}

@Schema()
export class RecombineResponse {
  @Field()
  applied: boolean;

  @Field(() => Integer)
  before: number;

  @Field(() => Integer)
  after: number;

  @Field(() => [MergedChapterItem])
  merged: MergedChapterItem[];

  @Field(() => [AmbiguousBoundaryItem])
  ambiguous: AmbiguousBoundaryItem[];
}
