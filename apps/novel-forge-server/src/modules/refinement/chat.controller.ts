/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import {
  ChatMessageResponse,
  ChatProjectParams,
  ChatSessionParams,
  ChatSessionResponse,
  ChatTurnBody,
  ChatTurnResponse,
  CreateChatSessionBody,
  ListChatMessagesQuery,
  ListChatMessagesResponse,
  ListChatSessionResponse,
  ListChatSessionsQuery,
  UpdateChatSessionBody,
  UpdateSessionModelBody,
} from './chat.dto';
import { ChatService } from './chat.service';
import { serialiseMessage, serialiseProposal } from './serialise';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/projects/:projectId/chat/sessions')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @RespondFor(201, ChatSessionResponse)
  createSession(@Params() params: ChatProjectParams, @Body() body: CreateChatSessionBody): Promise<ChatSessionResponse> {
    return this.chatService.createSession(params.projectId, body) as unknown as Promise<ChatSessionResponse>;
  }

  @Get()
  @RespondFor(200, ListChatSessionResponse)
  listSessions(@Params() params: ChatProjectParams, @Query() query: ListChatSessionsQuery): Promise<ListChatSessionResponse> {
    return this.chatService.listSessions(params.projectId, query) as unknown as Promise<ListChatSessionResponse>;
  }

  @Get('/:sessionId')
  @RespondFor(200, ChatSessionResponse)
  getSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatService.getSession(params.projectId, params.sessionId) as unknown as Promise<ChatSessionResponse>;
  }

  @Get('/:sessionId/messages')
  @RespondFor(200, ListChatMessagesResponse)
  async listMessages(@Params() params: ChatSessionParams, @Query() query: ListChatMessagesQuery): Promise<ListChatMessagesResponse> {
    const [messages, pendingTurn] = await Promise.all([
      this.chatService.listMessages(params.projectId, params.sessionId, query),
      this.chatService.hasPendingTurn(params.projectId, params.sessionId),
    ]);
    return { messages: messages.map(serialiseMessage) as unknown as ChatMessageResponse[], pendingTurn };
  }

  @Post('/:sessionId/messages')
  @RespondFor(201, ChatTurnResponse)
  turn(@Params() params: ChatSessionParams, @Body() body: ChatTurnBody): Promise<ChatTurnResponse> {
    return this.chatService.turn(params.projectId, params.sessionId, body.content).then(r => ({
      userMessage: serialiseMessage(r.userMessage),
      assistantMessage: serialiseMessage(r.assistantMessage),
      proposal: r.proposal ? serialiseProposal(r.proposal) : undefined,
      applied: r.applied,
      applyNote: r.applyNote,
      runId: r.runId,
    })) as unknown as Promise<ChatTurnResponse>;
  }

  @Patch('/:sessionId')
  @RespondFor(200, ChatSessionResponse)
  updateSession(@Params() params: ChatSessionParams, @Body() body: UpdateChatSessionBody): Promise<ChatSessionResponse> {
    return this.chatService.updateSession(params.projectId, params.sessionId, body) as unknown as Promise<ChatSessionResponse>;
  }

  @Patch('/:sessionId/model')
  @RespondFor(200, ChatSessionResponse)
  updateSessionModel(@Params() params: ChatSessionParams, @Body() body: UpdateSessionModelBody): Promise<ChatSessionResponse> {
    return this.chatService.updateSessionModel(params.projectId, params.sessionId, body.provider ?? null, body.model ?? null) as unknown as Promise<ChatSessionResponse>;
  }

  @Delete('/:sessionId')
  @RespondFor(200, ChatSessionResponse)
  deleteSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatService.deleteSession(params.projectId, params.sessionId) as unknown as Promise<ChatSessionResponse>;
  }

  @Post('/:sessionId/archive')
  @RespondFor(200, ChatSessionResponse)
  archiveSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatService.setSessionStatus(params.projectId, params.sessionId, 'archived') as unknown as Promise<ChatSessionResponse>;
  }

  @Post('/:sessionId/unarchive')
  @RespondFor(200, ChatSessionResponse)
  unarchiveSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatService.setSessionStatus(params.projectId, params.sessionId, 'active') as unknown as Promise<ChatSessionResponse>;
  }
}
