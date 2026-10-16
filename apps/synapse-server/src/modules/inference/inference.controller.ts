import { Inject } from '@shadow-library/app';
import { RequireScope } from '@shadow-library/auth/module';
import { Body, ContextService, HttpController, type HttpRequest, type HttpResponse, Post, Req, Res, RespondFor } from '@shadow-library/fastify';

import { SYNAPSE_SCOPES } from '@modules/auth';
import { type CatalogTimers } from '@modules/catalog';
import { type JsonObject } from '@modules/providers';

import { callingApp } from './calling-app.util';
import { watchClientDisconnect } from './client-disconnect.util';
import { ChatCompletionBody, ChatCompletionResponse, EmbeddingsBody, EmbeddingsResponse, ImageGenerationBody, ImageGenerationResponse } from './inference.dto';
import { type ImageGenerationResult, InferenceService } from './inference.service';
import { INFERENCE_TIMERS, InflightRequests } from './inflight-requests.service';
import { type RequestAbort } from './request-abort';
import { SseSink } from './sse-sink';
import { SynapseErrorResponses } from './synapse-error-responses.decorator';

@HttpController('/api/v1')
@RequireScope(SYNAPSE_SCOPES.infer)
@SynapseErrorResponses()
export class InferenceController {
  constructor(
    private readonly inference: InferenceService,
    private readonly inflight: InflightRequests,
    private readonly context: ContextService,
    @Inject(INFERENCE_TIMERS) private readonly timers: CatalogTimers,
  ) {}

  /** `stream: true` answers server-sent events written straight to the socket, so its 200 schema documents the JSON answer only */
  @Post('/chat/completions')
  @RespondFor(200, ChatCompletionResponse)
  chatCompletions(@Body() body: ChatCompletionBody, @Req() request: HttpRequest, @Res() reply: HttpResponse): Promise<JsonObject | undefined> {
    const app = callingApp(this.context.getAuthPrincipal());
    if (body.stream !== true) return this.dispatch(request, reply, abort => this.inference.completeChat(app, body, abort));
    return this.dispatch(request, reply, abort => this.inference.streamChat(app, body, abort, new SseSink(reply, this.timers, abort.signal)).then(() => undefined));
  }

  @Post('/embeddings')
  @RespondFor(200, EmbeddingsResponse)
  embeddings(@Body() body: EmbeddingsBody, @Req() request: HttpRequest, @Res() reply: HttpResponse): Promise<JsonObject> {
    const app = callingApp(this.context.getAuthPrincipal());
    return this.dispatch(request, reply, abort => this.inference.embed(app, body, abort));
  }

  @Post('/images/generations')
  @RespondFor(200, ImageGenerationResponse)
  imageGenerations(@Body() body: ImageGenerationBody, @Req() request: HttpRequest, @Res() reply: HttpResponse): Promise<ImageGenerationResult> {
    const app = callingApp(this.context.getAuthPrincipal());
    return this.dispatch(request, reply, abort => this.inference.generateImages(app, body, abort));
  }

  private async dispatch<T>(request: HttpRequest, reply: HttpResponse, call: (abort: RequestAbort) => Promise<T>): Promise<T> {
    const abort = this.inflight.begin();
    const stopWatching = watchClientDisconnect({ response: reply.raw, socket: request.raw.socket }, () => abort.abort('client'));
    try {
      return await call(abort);
    } finally {
      stopWatching();
      this.inflight.end(abort);
    }
  }
}
