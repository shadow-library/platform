import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { WriterAttemptRole } from '@server/common';
import { type Ai } from '@server/database';

@Schema()
export class SnapshotParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer)
  n: number;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  snapshotId: bigint;
}

@Schema({ description: "One writer attempt's metadata — no messages or kept-back detail, just enough to pick one for the Writer's view." })
class WriterSnapshotSummaryResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field(() => Integer)
  draftRevision: number;

  @Field(() => Integer)
  attempt: number;

  @Field(() => WriterAttemptRole)
  role: Ai.WriterAttemptRole;

  @Field()
  promptKey: string;

  @Field()
  promptVersion: string;

  @Field(() => Object, { additionalProperties: true })
  modelRoute: { provider: string; model: string };

  @Field()
  isolated: boolean;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListWriterSnapshotResponse {
  @Field(() => [WriterSnapshotSummaryResponse])
  items: WriterSnapshotSummaryResponse[];
}

@Schema({ description: 'One message as the model router sent it.' })
class WriterSnapshotMessageResponse {
  @Field()
  role: string;

  @Field()
  content: string;
}

@Schema({
  description:
    "The Writer's view of one attempt: the exact messages the model router sent, what was kept back and why, and the plan and Story " +
    'Bible state it was written against. An isolated chapter reads this walled off, like any other standard read.',
})
export class WriterSnapshotDetailResponse extends WriterSnapshotSummaryResponse {
  @Field(() => String, { optional: true, nullable: true })
  contextPackId: bigint | null;

  @Field(() => [WriterSnapshotMessageResponse])
  messages: WriterSnapshotMessageResponse[];

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  keptBack: Record<string, unknown> | null;

  @Field(() => Integer, { optional: true, nullable: true })
  planRevision: number | null;

  @Field({ optional: true, nullable: true })
  bibleHash: string | null;
}
