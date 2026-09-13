import { vi } from 'vitest';

export interface HttpCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

export interface HttpReply {
  status?: number;
  body?: unknown;
}

export interface HttpFake {
  calls: HttpCall[];
  count: (method: string, path: string) => number;
}

/** Stubs the global `fetch` the app transport sends through; unstub it with `vi.unstubAllGlobals()`. */
export function httpFake(handlers: Record<string, (call: HttpCall, attempt: number) => HttpReply | Promise<HttpReply>>): HttpFake {
  const fake: HttpFake = { calls: [], count: (method, path) => fake.calls.filter(call => call.method === method && call.path === path).length };

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://memoir.test').pathname;
    const method = init?.method ?? 'GET';
    const call: HttpCall = { method, path, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };

    const attempt = fake.count(method, path);
    fake.calls.push(call);

    const handler = handlers[`${method} ${path}`];
    if (!handler) return new Response(JSON.stringify({ code: 'TEST_404', type: 'NotFound', message: `no handler for ${method} ${path}` }), { status: 404 });

    const reply = await handler(call, attempt);
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  });

  return fake;
}
