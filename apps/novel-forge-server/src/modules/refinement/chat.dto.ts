import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { ChatMode, ChatScope, ChatSessionStatus, ChatTurnOutcome, SortByTime } from '@server/common';
import { type Refinement } from '@server/database';

import { AppliedArtifactItem, OpResultItem, ProposalResponse } from './refinement.dto';

@Schema()
export class ChatProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class ChatSessionParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  // A pattern, not `format: 'uuid'` — fastify's route schema compiler has no uuid format registered
  // and fails to build the route with one.
  @Field({
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    description: 'Chat session UUID.',
  })
  sessionId: string;
}

@Schema()
export class CreateChatSessionBody {
  @Field(() => ChatMode, { optional: true })
  mode?: Refinement.ChatMode;
}

@Schema({ minProperties: 1 })
export class UpdateChatSessionBody {
  @Field(() => ChatMode, { optional: true })
  mode?: Refinement.ChatMode;

  @Field({ optional: true })
  title?: string;
}

@Schema()
export class UpdateSessionModelBody {
  @Field({ optional: true, nullable: true, description: 'Model provider override; clear both override fields to use the project or profile default.' })
  provider?: string | null;

  @Field({ optional: true, nullable: true, description: 'Model name override; clear both override fields to use the project or profile default.' })
  model?: string | null;
}

@Schema()
export class ListChatSessionsQuery extends PaginationQuery(SortByTime, { sortBy: 'updatedAt', sortOrder: 'desc' }) {
  @Field(() => ChatScope, { optional: true })
  scopeType?: Refinement.ChatScope;

  @Field(() => ChatSessionStatus, { optional: true })
  status?: Refinement.ChatSessionStatus;
}

@Schema()
export class ChatSessionResponse {
  @Field()
  id: string;

  @Field(() => String)
  projectId: bigint;

  @Field(() => ChatScope)
  scopeType: Refinement.ChatScope;

  @Field({ optional: true, nullable: true })
  scopeRef?: string | null;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => ChatSessionStatus)
  status: Refinement.ChatSessionStatus;

  @Field(() => ChatMode)
  mode: Refinement.ChatMode;

  @Field({ optional: true, nullable: true })
  modelProvider?: string | null;

  @Field({ optional: true, nullable: true })
  modelId?: string | null;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field(() => Integer)
  summaryThroughOrdinal: number;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  lastTurnAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListChatSessionResponse extends Paginated(ChatSessionResponse) {}

@Schema()
export class ListChatMessagesQuery {
  @Field(() => Integer, { optional: true, minimum: 1, description: 'return messages with ordinal strictly below this value' })
  before?: number;

  @Field(() => Integer, { optional: true, minimum: 1, maximum: 200 })
  limit?: number;
}

@Schema()
export class ChatMessageResponse {
  @Field(() => String)
  id: bigint;

  @Field()
  sessionId: string;

  @Field(() => Integer)
  ordinal: number;

  @Field()
  role: string;

  @Field()
  content: string;

  @Field(() => String, { optional: true, nullable: true })
  proposalId?: bigint | null;

  @Field({ optional: true, nullable: true })
  runId?: string | null;

  @Field({ optional: true, nullable: true })
  modelProvider?: string | null;

  @Field({ optional: true, nullable: true })
  modelId?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema({ description: 'The turn running right now, so a client can name the phase and count the wait instead of showing a bare spinner.' })
export class PendingTurnResponse {
  @Field()
  runId: string;

  @Field({ description: 'Workflow graph driving the turn — `chat-turn`.' })
  graph: string;

  @Field(() => String, { format: 'date-time', description: 'When the turn started; elapsed time is measured from here so it survives a refresh.' })
  startedAt: Date;
}

@Schema({
  description:
    'The turn that died or was stopped, on a transcript still ending in an unanswered user message, so a reload shows why instead of a silent thread. ' +
    "`status: 'cancelled'` is the author stopping the turn deliberately — terminal and not a failure, so the client must not offer the same retry affordance it offers a failure.",
})
export class FailedTurnResponse {
  @Field()
  runId: string;

  @Field()
  graph: string;

  @Field(() => ChatTurnOutcome, { description: 'Whether the run failed on its own or was cancelled by the author.' })
  status: 'failed' | 'cancelled';

  @Field(() => String, { format: 'date-time' })
  endedAt: Date;

  @Field({ optional: true, nullable: true, description: 'Application error code, when the failure carried one; never present for a cancelled run.' })
  code?: string | null;

  @Field({ optional: true, nullable: true })
  message?: string | null;
}

@Schema()
export class ListChatMessagesResponse {
  @Field(() => [ChatMessageResponse])
  messages: ChatMessageResponse[];

  @Field(() => PendingTurnResponse, { optional: true, nullable: true, description: 'Present while a chat turn is running for this session; null otherwise.' })
  pendingTurn?: PendingTurnResponse | null;

  @Field(() => FailedTurnResponse, {
    optional: true,
    nullable: true,
    description: 'Present when the last turn failed or was cancelled, leaving the transcript unanswered — see its `status`.',
  })
  failedTurn?: FailedTurnResponse | null;
}

@Schema({ description: 'Whether a session’s turn is still running and how far its transcript has got — cheap enough to poll while a turn runs.' })
export class ChatTurnStatusResponse {
  @Field(() => PendingTurnResponse, { optional: true, nullable: true, description: 'Present while a chat turn is running for this session; null otherwise.' })
  pendingTurn?: PendingTurnResponse | null;

  @Field(() => FailedTurnResponse, {
    optional: true,
    nullable: true,
    description: 'Present when the last turn failed or was cancelled, leaving the transcript unanswered — see its `status`.',
  })
  failedTurn?: FailedTurnResponse | null;

  @Field(() => Integer, { description: 'Ordinal of the newest message in the transcript; 0 when it is empty.' })
  lastOrdinal: number;
}

@Schema()
export class ChatTurnBody {
  @Field({
    minLength: 1,
    maxLength: 200_000,
    description: 'Chat content; accepts long premises, chapters, and reference documents up to 200,000 characters.',
  })
  content: string;

  @Field({
    optional: true,
    description:
      "The author's explicit permission for this turn to rewrite chapter prose (draft.update, draft.remove, action.revise_draft). Off by default: a plan edit changes the brief and the chapter is regenerated from it.",
  })
  proseEdits?: boolean;
}

@Schema({ description: 'Proposal application outcome returned as part of an automatic-mode turn.' })
export class TurnAppliedResult {
  @Field(() => [AppliedArtifactItem])
  applied: AppliedArtifactItem[];

  @Field(() => [String])
  staleMarked: string[];

  @Field(() => [OpResultItem])
  opResults: OpResultItem[];
}

@Schema()
export class ChatTurnResponse {
  @Field(() => ChatMessageResponse)
  userMessage: ChatMessageResponse;

  @Field(() => ChatMessageResponse)
  assistantMessage: ChatMessageResponse;

  @Field(() => ProposalResponse, { optional: true })
  proposal?: ProposalResponse;

  @Field(() => TurnAppliedResult, { optional: true, description: 'present when the session runs in auto mode and this turn applied its change-set' })
  applied?: TurnAppliedResult;

  @Field({ optional: true, description: 'why an auto-mode change-set was NOT applied (conflict, finalize gating, action failure)' })
  applyNote?: string;

  @Field()
  runId: string;
}

@Schema()
export class TurnStreamParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field({
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    description: 'Workflow run UUID, as returned by the turn-stream POST.',
  })
  runId: string;
}

@Schema({ description: 'A turn accepted and now running. Open the run’s event stream to watch it; the turn completes and persists whether or not anyone does.' })
export class ChatTurnStreamResponse {
  @Field({ description: 'Workflow run driving the turn — the key of GET /api/v1/projects/:projectId/turns/:runId/stream.' })
  runId: string;
}
