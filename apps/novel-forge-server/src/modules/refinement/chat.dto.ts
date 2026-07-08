/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */
import { ChatScope, ChatSessionStatus, SortByTime } from '@server/common';
import { type Refinement } from '@server/database';

import { ProposalResponse } from './refinement.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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
  @Field({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' })
  sessionId: string;
}

@Schema()
export class CreateChatSessionBody {
  @Field(() => ChatScope)
  scopeType: Refinement.ChatScope;

  @Field({ optional: true })
  scopeRef?: string;

  @Field({ optional: true })
  title?: string;
}

@Schema()
export class ListChatSessionsQuery extends PaginationQuery(SortByTime) {
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

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListChatMessagesResponse {
  @Field(() => [ChatMessageResponse])
  messages: ChatMessageResponse[];
}

@Schema()
export class ChatTurnBody {
  @Field({ minLength: 1, maxLength: 20_000 })
  content: string;
}

@Schema()
export class ChatTurnResponse {
  @Field(() => ChatMessageResponse)
  userMessage: ChatMessageResponse;

  @Field(() => ChatMessageResponse)
  assistantMessage: ChatMessageResponse;

  @Field(() => ProposalResponse, { optional: true })
  proposal?: ProposalResponse;

  @Field()
  runId: string;
}
