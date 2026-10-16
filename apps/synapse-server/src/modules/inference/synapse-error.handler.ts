import { DefaultErrorHandler, type HttpRequest, type HttpResponse } from '@shadow-library/fastify';

import { type RenderedError, rendersSynapseErrors, synapseErrorBody } from './synapse-error.util';

interface CapturedReply {
  status: number;
  payload?: RenderedError;
}

/**
 * The platform handler still classifies, masks and logs every error; on the Synapse routes its answer is re-shaped into OpenAI's
 * `{ error: { message, type, code, param? } }` and written with a plain JSON serializer, because the routes' default 4xx/5xx response
 * schema is the platform shape and would strip it.
 */
export class SynapseErrorHandler extends DefaultErrorHandler {
  override handle(err: Error, req: HttpRequest, res: HttpResponse): HttpResponse {
    if (!rendersSynapseErrors(req.url)) return super.handle(err, req, res);

    const captured: CapturedReply = { status: 500 };
    const capture = {
      status: (status: number) => {
        captured.status = status;
        return capture;
      },
      send: (payload: RenderedError) => {
        captured.payload = payload;
        return capture;
      },
    };
    super.handle(err, req, capture as unknown as HttpResponse);

    const rendered = captured.payload ?? { code: 'UNKNOWN', message: 'Unknown Error' };
    return res
      .status(captured.status)
      .type('application/json; charset=utf-8')
      .serializer((payload: unknown) => JSON.stringify(payload))
      .send(synapseErrorBody(captured.status, rendered, err));
  }
}
