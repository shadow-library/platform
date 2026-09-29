import { EnumType, Field, Integer, PickType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { ChatMode, ChatScope, ChatSessionStatus, ChatTurnOutcome, ContentMode, CostTier, SortByTime } from '@server/common';
import { type Project, type Refinement } from '@server/database';

import { AppliedArtifactItem, OpResultItem, ProposalResponse } from './refinement.dto';
import { OP_SOURCES, type OpSource } from './write-policy';

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

@Schema({ minProperties: 1, description: 'Every field is optional: an omitted field is left as it is, `null` clears it back to the project default.' })
export class UpdateSessionModelBody {
  @Field({ optional: true, nullable: true, description: 'Model provider override; clear both override fields to use the project or profile default.' })
  provider?: string | null;

  @Field({ optional: true, nullable: true, description: 'Model name override; clear both override fields to use the project or profile default.' })
  model?: string | null;

  @Field(() => ContentMode, { optional: true, nullable: true, description: "This chat's default model type for its replies; chapters keep their own content mode." })
  contentMode?: Project.ContentMode | null;

  @Field(() => CostTier, { optional: true, nullable: true, description: "This chat's default cost tier; actions a turn starts run at the turn's tier." })
  costTier?: Project.CostTier | null;
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

  @Field(() => ContentMode, { optional: true, nullable: true, description: "The chat's own model type; null follows the project's content mode." })
  contentMode?: Project.ContentMode | null;

  @Field(() => CostTier, { optional: true, nullable: true, description: "The chat's own cost tier; null follows the project's cost tier." })
  costTier?: Project.CostTier | null;

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

@Schema({ description: 'One concrete example answer to a question card, with the reasoning to accept or decline it.' })
export class ChatQuestionAnswerResponse {
  @Field()
  title: string;

  @Field({ optional: true, nullable: true })
  why?: string | null;

  @Field({ optional: true, nullable: true })
  tradeOff?: string | null;

  @Field({ optional: true, description: 'true on the one answer Forge recommends' })
  recommended?: boolean;
}

@Schema({
  description:
    "An identity decision the author hasn't made yet, put to them as 2-4 concrete answers with trade-offs and a recommendation. " +
    '"Undecided for now" is always an accepted answer and is not one of these cards.',
})
export class ChatQuestionResponse {
  @Field()
  question: string;

  @Field({ optional: true, nullable: true })
  why?: string | null;

  @Field(() => [ChatQuestionAnswerResponse], { minItems: 2, maxItems: 4 })
  answers: ChatQuestionAnswerResponse[];

  @Field({ optional: true, nullable: true, description: 'The progress checklist key this question settles, when it settles one.' })
  progressKey?: string | null;
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

  @Field(() => String, { optional: true, nullable: true, description: "The turn's suggestion cards: a pending proposal the author accepts or declines op by op." })
  proposalId?: bigint | null;

  @Field(() => String, {
    optional: true,
    nullable: true,
    description: "The turn's changes taken from the author's own words, applied in the turn and undone by reverting this proposal.",
  })
  appliedProposalId?: bigint | null;

  @Field({ optional: true, nullable: true })
  runId?: string | null;

  @Field({ optional: true, nullable: true })
  modelProvider?: string | null;

  @Field({ optional: true, nullable: true })
  modelId?: string | null;

  @Field(() => ContentMode, {
    optional: true,
    nullable: true,
    description: 'The model type the reply was written under; null on user messages and on replies older than the selection.',
  })
  contentMode?: Project.ContentMode | null;

  @Field(() => CostTier, { optional: true, nullable: true, description: 'The cost tier the reply was written at; null on user messages and on replies older than the selection.' })
  costTier?: Project.CostTier | null;

  @Field({
    optional: true,
    nullable: true,
    description: "This reply's model cost, folding in its title and compaction runs; null on user messages and on a reply that carries no run.",
  })
  costUsd?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  inputTokens?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  cachedInputTokens?: number | null;

  @Field(() => Integer, { optional: true, nullable: true })
  outputTokens?: number | null;

  @Field({
    optional: true,
    description: 'A message of the author’s long enough to keep as notes, which the notes do not hold yet: offer "Save this as notes?", answered by `POST /notes/from-message`.',
  })
  offersNotes?: boolean;

  @Field(() => ChatQuestionResponse, { optional: true, nullable: true, description: "This turn's question card, when Forge raised one; null on every other message." })
  question?: ChatQuestionResponse | null;

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

  @Field({
    optional: true,
    description: 'Just discussing: nothing the turn proposes applies — every change becomes a suggestion card for the author to accept or decline. Off by default.',
  })
  justDiscussing?: boolean;

  @Field(() => ContentMode, {
    optional: true,
    description: "Model type for this turn's reply only; omitted follows the chat, then the project. Chapters keep their own content mode.",
  })
  contentMode?: Project.ContentMode;

  @Field(() => CostTier, {
    optional: true,
    description: 'Cost tier for this turn only; omitted follows the chat, then the project. Actions this turn starts (write, review, audit) run at it.',
  })
  costTier?: Project.CostTier;
}

const AppliedOpSource = EnumType.create('AppliedOpSource', [...OP_SOURCES]);

@Schema({ additionalProperties: true, description: 'Apply-time result for one operation a turn applied, with where its words came from.' })
export class TurnOpResultItem extends PickType(OpResultItem, ['index', 'status', 'error', 'note', 'result'] as const) {
  @Field(() => AppliedOpSource, {
    description: "quoted: the author's own words in this turn back the op. idea: the model proposed it and Edit freely applied it — mark it as an idea the author can undo.",
  })
  source: OpSource;
}

@Schema({ description: 'Proposal application outcome returned as part of an automatic-mode turn.' })
export class TurnAppliedResult {
  @Field(() => [AppliedArtifactItem])
  applied: AppliedArtifactItem[];

  @Field(() => [String])
  staleMarked: string[];

  @Field(() => [TurnOpResultItem], { description: "One result per applied operation, indexed into the applied proposal's change-set." })
  opResults: TurnOpResultItem[];
}

@Schema()
export class ChatTurnResponse {
  @Field(() => ChatMessageResponse)
  userMessage: ChatMessageResponse;

  @Field(() => ChatMessageResponse)
  assistantMessage: ChatMessageResponse;

  @Field(() => ProposalResponse, { optional: true, description: "The turn's suggestion cards, pending the author's per-op accept or decline." })
  proposal?: ProposalResponse;

  @Field(() => ProposalResponse, {
    optional: true,
    description: "The turn's changes already applied and undoable: the author's own words (each op carries its quote) and, under Edit freely, the model's ideas.",
  })
  appliedProposal?: ProposalResponse;

  @Field(() => TurnAppliedResult, { optional: true, description: 'present when this turn applied changes; each result says whether its op is quoted or an idea' })
  applied?: TurnAppliedResult;

  @Field({ optional: true, description: 'why ops that rest on the author’s words were NOT applied (a warning to review, a conflict, a refused write)' })
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
