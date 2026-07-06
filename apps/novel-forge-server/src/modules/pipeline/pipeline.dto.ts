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
  @Field(() => Object)
  characterArcs: unknown;

  @Field()
  powerCurve: string;
}

@Schema()
export class ResumeResponse {
  @Field()
  jobId: string;
}
