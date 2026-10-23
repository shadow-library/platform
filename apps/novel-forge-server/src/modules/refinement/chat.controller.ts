import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { notesOffer } from '../notes/notes-message';
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
import { presentChatSession } from './chat-selection';
import { ChatSessionService } from './chat-session.service';
import { ChatService } from './chat.service';
import { serialiseMessage, serialiseTurn, withTurnCost } from './serialise';
import { TurnCostService } from './turn-cost.service';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/chat/sessions')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatSessions: ChatSessionService,
    private readonly turnCost: TurnCostService,
  ) {}

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post()
  @RespondFor(201, ChatSessionResponse)
  createSession(@Params() params: ChatProjectParams, @Body() body: CreateChatSessionBody): Promise<ChatSessionResponse> {
    return this.chatSessions.createSession(params.projectId, body).then(presentChatSession);
  }

  @Get()
  @RespondFor(200, ListChatSessionResponse)
  async listSessions(@Params() params: ChatProjectParams, @Query() query: ListChatSessionsQuery): Promise<ListChatSessionResponse> {
    const page = await this.chatSessions.listSessions(params.projectId, query);
    return { ...page, items: page.items.map(presentChatSession) };
  }

  @Get('/:sessionId')
  @RespondFor(200, ChatSessionResponse)
  getSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatSessions.getSession(params.projectId, params.sessionId).then(presentChatSession);
  }

  @Get('/:sessionId/messages')
  @RespondFor(200, ListChatMessagesResponse)
  async listMessages(@Params() params: ChatSessionParams, @Query() query: ListChatMessagesQuery): Promise<ListChatMessagesResponse> {
    const [messages, { pendingTurn, failedTurn }, notes] = await Promise.all([
      this.chatSessions.listMessages(params.projectId, params.sessionId, query),
      this.chatService.turnStatus(params.projectId, params.sessionId),
      this.chatService.authorNotes(params.projectId),
    ]);
    const cost = await this.turnCost.forMessages(params.projectId, messages);
    const offersNotes = notesOffer(notes);
    return { messages: messages.map(m => withTurnCost(serialiseMessage(m, offersNotes), cost.get(m.id))), pendingTurn, failedTurn };
  }

  /** What a client polls while a turn runs: whether it is still running and how far the transcript has got, without the transcript. */
  @Get('/:sessionId/turn')
  @RespondFor(200, ChatTurnStatusResponse)
  turnStatus(@Params() params: ChatSessionParams): Promise<ChatTurnStatusResponse> {
    return this.chatService.turnStatus(params.projectId, params.sessionId);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/:sessionId/messages')
  @RespondFor(201, ChatTurnResponse)
  async createTurn(@Params() params: ChatSessionParams, @Body() body: ChatTurnBody): Promise<ChatTurnResponse> {
    const result = await this.chatService.turn(params.projectId, params.sessionId, body.content, undefined, {
      proseEdits: body.proseEdits ?? false,
      justDiscussing: body.justDiscussing ?? false,
      contentMode: body.contentMode,
      costTier: body.costTier,
      contexts: body.contexts,
    });
    const turn = serialiseTurn(result, notesOffer(await this.chatService.authorNotes(params.projectId)));
    const cost = await this.turnCost.forMessages(params.projectId, [result.assistantMessage]);
    return { ...turn, assistantMessage: withTurnCost(turn.assistantMessage, cost.get(result.assistantMessage.id)) };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Patch('/:sessionId')
  @RespondFor(200, ChatSessionResponse)
  updateSession(@Params() params: ChatSessionParams, @Body() body: UpdateChatSessionBody): Promise<ChatSessionResponse> {
    return this.chatSessions.updateSession(params.projectId, params.sessionId, body).then(presentChatSession);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Patch('/:sessionId/model')
  @RespondFor(200, ChatSessionResponse)
  updateSessionModel(@Params() params: ChatSessionParams, @Body() body: UpdateSessionModelBody): Promise<ChatSessionResponse> {
    return this.chatSessions.updateSessionModel(params.projectId, params.sessionId, body).then(presentChatSession);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Delete('/:sessionId')
  @RespondFor(200, ChatSessionResponse)
  deleteSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatSessions.deleteSession(params.projectId, params.sessionId).then(presentChatSession);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:sessionId/archive')
  @RespondFor(200, ChatSessionResponse)
  archiveSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatSessions.setSessionStatus(params.projectId, params.sessionId, 'archived').then(presentChatSession);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:sessionId/unarchive')
  @RespondFor(200, ChatSessionResponse)
  unarchiveSession(@Params() params: ChatSessionParams): Promise<ChatSessionResponse> {
    return this.chatSessions.setSessionStatus(params.projectId, params.sessionId, 'active').then(presentChatSession);
  }
}
