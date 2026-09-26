import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { JobEventType, JobKind, JobStatus } from '@server/common';
import { type Job } from '@server/database';

const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

@Schema()
export class ChatJobsParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  // A pattern, not `format: 'uuid'` — fastify's route schema compiler has no uuid format registered.
  @Field({ pattern: UUID_PATTERN, description: 'Chat session UUID.' })
  sessionId: string;
}

@Schema()
export class ChatJobParams extends ChatJobsParams {
  @Field({ pattern: UUID_PATTERN, description: 'Job UUID.' })
  jobId: string;
}

@Schema()
export class ChatJobEventsQuery {
  @Field({
    optional: true,
    pattern: '^[0-9]{1,9}$',
    description:
      'Only events after this seq — the `cursor` of the jobs list or the `seq` of the last event read. The stream also reads `Last-Event-ID`. Without either, only the events of running jobs and how each job that settled in the last hour ended.',
  })
  after?: string;
}

@Schema({ description: 'The chat card a job was started from.' })
export class ChatJobOriginResponse {
  @Field()
  proposalId: string;

  @Field(() => Integer)
  opIndex: number;

  @Field({ optional: true, nullable: true })
  messageId?: string | null;
}

@Schema()
export class ChatJobResponse {
  @Field()
  id: string;

  @Field(() => JobKind)
  kind: Job.Kind;

  @Field()
  target: string;

  @Field(() => JobStatus)
  status: Job.Status;

  @Field(() => Integer, { description: 'Attempts started so far; a model or gateway timeout retries an organise or plan job once.' })
  attempts: number;

  @Field({ optional: true, nullable: true })
  lastError?: string | null;

  @Field(() => Object, {
    optional: true,
    nullable: true,
    additionalProperties: true,
    description: 'Latest progress snapshot; `proposalId` names the staged card once there is one.',
  })
  progress?: unknown;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time', description: 'When a job waiting to retry is dispatched again.' })
  nextAttemptAt?: Date | null;

  @Field(() => ChatJobOriginResponse)
  origin: ChatJobOriginResponse;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListChatJobsResponse {
  @Field(() => [ChatJobResponse], { description: 'Jobs this chat started that are still running, plus those that finished within the last hour, each with its status.' })
  items: ChatJobResponse[];

  @Field(() => Integer, { description: "The session's latest job event seq as of `items`: open the event stream after it to follow these jobs from here." })
  cursor: number;
}

@Schema({ description: 'One step of a job a chat started. The same shape is the `data` of each `job` event on the session’s job event stream, whose SSE id is `seq`.' })
export class ChatJobEventResponse {
  @Field(() => Integer, { description: 'The cursor: increasing within the session in the order events commit.' })
  seq: number;

  @Field()
  jobId: string;

  @Field(() => JobKind)
  kind: Job.Kind;

  @Field(() => JobEventType)
  type: Job.EventType;

  @Field(() => Object, {
    optional: true,
    nullable: true,
    additionalProperties: true,
    description: "`step` and `done` carry the job's progress; `started` and `retrying` the attempt; `failed` and `retrying` the error.",
  })
  data?: unknown;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListChatJobEventsResponse {
  @Field(() => [ChatJobEventResponse])
  items: ChatJobEventResponse[];
}
