import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, EventStream, Get, HttpController, type HttpResponse, HttpStatus, Params, Post, Res, RespondFor } from '@shadow-library/fastify';

import { GENERATION_RUN_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { ChatSessionParams, ChatTurnBody, ChatTurnStreamResponse, TurnStreamParams } from './chat.dto';
import { TurnStreamService } from './turn-stream.service';

const TERMINAL_EVENTS = new Set(['done', 'error']);

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class TurnStreamController {
  constructor(private readonly turnStreams: TurnStreamService) {}

  /** The turn is owned by the service, not by this request, so it completes and persists whether or not a client ever watches it. */
  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @BotPermission(GENERATION_RUN_PERMISSION)
  @Post('/chats/:sessionId/turn/stream')
  @HttpStatus(202)
  @RespondFor(202, ChatTurnStreamResponse)
  async startTurn(@Params() params: ChatSessionParams, @Body() body: ChatTurnBody): Promise<ChatTurnStreamResponse> {
    const runId = await this.turnStreams.start(params.projectId, params.sessionId, body.content, { proseEdits: body.proseEdits ?? false });
    return { runId };
  }

  /** The run is resolved before the response is hijacked, so an unknown or foreign run answers 404 rather than an empty stream. */
  @Get('/turns/:runId/stream')
  streamTurn(@Params() params: TurnStreamParams, @Res() response: HttpResponse): void {
    this.turnStreams.assertRun(params.projectId, params.runId);

    const stream = EventStream.open(response);
    stream.send({ event: 'ready', data: {} });
    const unsubscribe = this.turnStreams.subscribe(params.projectId, params.runId, frame => {
      const delivered = stream.send(frame);
      if (TERMINAL_EVENTS.has(frame.event)) stream.close();
      return delivered;
    });
    stream.onClose(unsubscribe);
  }
}
