import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import {
  ChatProjectParams,
  ChatSessionParams,
  ChatSessionResponse,
  ChatTurnBody,
  ChatTurnResponse,
  ChatTurnStatusResponse,
  CreateChatSessionBody,
  ListChatMessagesQuery,
  ListChatMessagesResponse,
  ListChatSessionResponse,
  ListChatSessionsQuery,
  UpdateChatSessionBody,
  UpdateSessionModelBody,
} from './chat.dto';
import { ChatService } from './chat.service';
import { type ChatTurnHandler, ChatTurnRegistry } from './chat-turn.registry';
import { serialiseMessage, serialiseTurn } from './serialise';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/chat/sessions')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly turnRegistry: ChatTurnRegistry,
  ) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post()
  @RespondFor(201, ChatSessionResponse)
  createSession(@Params() params: ChatProjectParams, @Body() body: CreateChatSessionBody): Promise<ChatSessionResponse> {
    return this.chatService.createSession(params.projectId, body);
  }

  @Get()
  @RespondFor(200, ListChatSessionResponse)
  listSessions(@Params() params: ChatProjectParams, @Query() query: ListChatSessionsQuery): Promise<ListChatSessionResponse> {
    return this.chatService.listSessions(params.projectId, query);
  }

  @Get('/:sessionId')
  @RespondFor(200, ChatSessionResponse)
  getSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatService.getSession(params.projectId, params.sessionId);
  }

  @Get('/:sessionId/messages')
  @RespondFor(200, ListChatMessagesResponse)
  async listMessages(@Params() params: ChatSessionParams, @Query() query: ListChatMessagesQuery): Promise<ListChatMessagesResponse> {
    const [messages, { pendingTurn, failedTurn }] = await Promise.all([
      this.chatService.listMessages(params.projectId, params.sessionId, query),
      this.chatService.turnStatus(params.projectId, params.sessionId),
    ]);
    return { messages: messages.map(serialiseMessage), pendingTurn, failedTurn };
  }

  /** What a client polls while a turn runs: whether it is still running and how far the transcript has got, without the transcript. */
  @Get('/:sessionId/turn')
  @RespondFor(200, ChatTurnStatusResponse)
  turnStatus(@Params() params: ChatSessionParams): Promise<ChatTurnStatusResponse> {
    return this.chatService.turnStatus(params.projectId, params.sessionId);
  }

  /**
   * One endpoint, two pipelines: a scope with a registered handler (the Ideation Studio) runs its own
   * turn, everything else runs the chat turn. The session is read here only to choose between them —
   * both pipelines re-read and re-guard it, and ownership was settled by the project middleware.
   */
  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/:sessionId/messages')
  @RespondFor(201, ChatTurnResponse)
  async createTurn(@Params() params: ChatSessionParams, @Body() body: ChatTurnBody): Promise<ChatTurnResponse> {
    const session = await this.chatService.getSession(params.projectId, params.sessionId);
    const scoped = this.turnRegistry.get(session.scopeType);
    const turn: ChatTurnHandler = scoped ?? ((projectId, sessionId, content) => this.chatService.turn(projectId, sessionId, content));

    return serialiseTurn(await turn(params.projectId, params.sessionId, body.content));
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Patch('/:sessionId')
  @RespondFor(200, ChatSessionResponse)
  updateSession(@Params() params: ChatSessionParams, @Body() body: UpdateChatSessionBody): Promise<ChatSessionResponse> {
    return this.chatService.updateSession(params.projectId, params.sessionId, body);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Patch('/:sessionId/model')
  @RespondFor(200, ChatSessionResponse)
  updateSessionModel(@Params() params: ChatSessionParams, @Body() body: UpdateSessionModelBody): Promise<ChatSessionResponse> {
    return this.chatService.updateSessionModel(params.projectId, params.sessionId, body.provider ?? null, body.model ?? null);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Delete('/:sessionId')
  @RespondFor(200, ChatSessionResponse)
  deleteSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatService.deleteSession(params.projectId, params.sessionId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:sessionId/archive')
  @RespondFor(200, ChatSessionResponse)
  archiveSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatService.setSessionStatus(params.projectId, params.sessionId, 'archived');
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:sessionId/unarchive')
  @RespondFor(200, ChatSessionResponse)
  unarchiveSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatService.setSessionStatus(params.projectId, params.sessionId, 'active');
  }
}
