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
import { JobKind, JobStatus } from '@server/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class JobIdParams {
  @Field()
  jobId: string;
}

@Schema()
export class ProjectJobsParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class JobResponse {
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

  // Job input and progress snapshots: their shape depends on the job kind (generate, extract, plan, …),
  // so both stay open objects with `additionalProperties` to keep every nested key through serialisation.
  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  payload?: unknown;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  progress?: unknown;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  nextAttemptAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListJobResponse {
  @Field(() => [JobResponse])
  items: JobResponse[];
}
