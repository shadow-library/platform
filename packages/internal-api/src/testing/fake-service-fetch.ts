import { type ServiceFetch, type ServiceTokenRequest } from '../service-fetch';

export interface RecordedServiceCall {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  token: ServiceTokenRequest;
}

export type ServiceReply = (call: RecordedServiceCall) => Response | Promise<Response>;

const BODILESS_STATUSES = new Set([204, 205, 304]);

export function jsonResponse(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  if (BODILESS_STATUSES.has(status) || body === undefined) return new Response(null, { status, headers });
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** Records every call and answers through `reply`, so a client is tested over its real request building rather than a stubbed method. */
export class FakeServiceFetch {
  readonly calls: RecordedServiceCall[] = [];

  constructor(private reply: ServiceReply = () => jsonResponse(200, {})) {}

  readonly fetch: ServiceFetch = async (url, init, token) => {
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const call = { url, method: init.method ?? 'GET', headers: new Headers(init.headers), body, token };
    this.calls.push(call);
    return this.reply(call);
  };

  answer(reply: ServiceReply): this {
    this.reply = reply;
    return this;
  }
}
