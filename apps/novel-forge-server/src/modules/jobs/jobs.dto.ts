import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { JobKind, JobStatus } from '@server/common';

@Schema()
export class JobIdParams {
  @Field()
  jobId: string;
}

@Schema({ description: "Spend split by where the cost came from — 'provider', 'gateway', 'estimate', or 'error' for a call that recorded none." })
export class JobCostSourceItem {
  @Field()
  costSource: string;

  @Field(() => Integer)
  calls: number;

  @Field()
  costUsd: number;
}

@Schema({ description: 'Cost and token totals across every run this job drove — empty (zero calls) for a job kind that makes no model calls, such as publish.' })
export class JobUsageResponse {
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

  @Field({ description: 'The part of costUsd estimated from registry list prices because the call recorded no cost.' })
  estimatedCostUsd: number;

  @Field(() => [JobCostSourceItem])
  byCostSource: JobCostSourceItem[];
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

  @Field(() => Object, {
    optional: true,
    nullable: true,
    additionalProperties: true,
    description: 'Job input whose fields depend on the job kind.',
  })
  payload?: unknown;

  @Field(() => Object, {
    optional: true,
    nullable: true,
    additionalProperties: true,
    description: 'Current progress snapshot whose fields depend on the job kind.',
  })
  progress?: unknown;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  nextAttemptAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;

  @Field(() => JobUsageResponse)
  usage: JobUsageResponse;
}
