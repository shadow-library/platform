import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, EventStream, Get, Headers, HttpController, type HttpResponse, HttpStatus, Params, Post, Res, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { AdminAccessService } from '@modules/actor';

import { ChatSessionParams, ChatTurnBody, ChatTurnStreamResponse, TurnStreamParams } from './chat.dto';
import { frameWithoutModel, resumeCursorOf, TurnStreamService } from './turn-stream.service';
import { TERMINAL_TURN_EVENTS } from './turn-stream.types';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class TurnStreamController {
  constructor(
    private readonly turnStreams: TurnStreamService,
    private readonly adminAccess: AdminAccessService,
  ) {}

  /** The turn is owned by the service, not by this request, so it completes and persists whether or not a client ever watches it. */
  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/chats/:sessionId/turn/stream')
  @HttpStatus(202)
  @RespondFor(202, ChatTurnStreamResponse)
  async startTurn(@Params() params: ChatSessionParams, @Body() body: ChatTurnBody): Promise<ChatTurnStreamResponse> {
    const runId = await this.turnStreams.start(params.projectId, params.sessionId, body.content, {
      proseEdits: body.proseEdits ?? false,
      justDiscussing: body.justDiscussing ?? false,
      contentMode: body.contentMode,
      costTier: body.costTier,
      contexts: body.contexts,
    });
    return { runId };
  }

  /** Any replica serves it; each `seq` is the SSE id so a reconnect resumes after `Last-Event-ID`, else the turn replays behind a `reset`. Unknown runs 404 before hijack. */
  @Get('/turns/:runId/stream')
  async streamTurn(@Params() params: TurnStreamParams, @Headers() headers: Record<string, unknown>, @Res() response: HttpResponse): Promise<void> {
    const [, showModels] = await Promise.all([this.turnStreams.assertRun(params.projectId, params.runId), this.adminAccess.canSeeModels()]);

    const stream = EventStream.open(response);
    stream.send({ event: 'ready', data: {} });
    const stop = this.turnStreams.follow(params.projectId, params.runId, resumeCursorOf(headers['last-event-id']), frame => {
      const delivered = stream.send(showModels ? frame : frameWithoutModel(frame));
      if (TERMINAL_TURN_EVENTS.has(frame.event)) stream.close();
      return delivered;
    });
    stream.onClose(stop);
  }
}
