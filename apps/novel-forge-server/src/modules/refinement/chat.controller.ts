/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

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
} from './chat.dto';
import { ChatService } from './chat.service';

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
    const messages = await this.chatService.listMessages(params.projectId, params.sessionId, query);
    return { messages: messages as unknown as ChatMessageResponse[] };
  }

  @Post('/:sessionId/messages')
  @RespondFor(201, ChatTurnResponse)
  turn(@Params() params: ChatSessionParams, @Body() body: ChatTurnBody): Promise<ChatTurnResponse> {
    return this.chatService.turn(params.projectId, params.sessionId, body.content) as unknown as Promise<ChatTurnResponse>;
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
