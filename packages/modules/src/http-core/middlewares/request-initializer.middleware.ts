/**
 * Importing npm packages
 */
import { AsyncHttpMiddleware, HttpRequest, HttpResponse, Middleware } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

declare module 'fastify' {
  interface FastifyRequest {
    cid: string;
  }
}

/**
 * Declaring the constants
 */
const HEADER_X_CORRELATION_ID = 'x-correlation-id';

@Middleware({ type: 'onRequest', weight: 100 })
export class RequestInitializerMiddleware implements AsyncHttpMiddleware {
  async use(request: HttpRequest, response: HttpResponse): Promise<void> {
    const cid = request.headers[HEADER_X_CORRELATION_ID] as string | undefined;
    request.cid = cid ?? request.id;
    response.header(HEADER_X_CORRELATION_ID, request.cid);
  }
}
