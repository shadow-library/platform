import { type FastifyRequest } from 'fastify';
import { type ContextService, type HttpResponse } from '@shadow-library/fastify';

export class FakeResponse {
  readonly headers = new Map<string, string>();
  statusCode = 200;
  sent = false;

  header(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  send(): this {
    this.sent = true;
    return this;
  }

  asHttpResponse(): HttpResponse {
    return this as unknown as HttpResponse;
  }
}

export const anonymousContext = { getAuthPrincipalOrNull: () => null } as unknown as ContextService;

export function fakeRequest(ifNoneMatch?: string): FastifyRequest {
  return { headers: ifNoneMatch === undefined ? {} : { 'if-none-match': ifNoneMatch } } as unknown as FastifyRequest;
}
