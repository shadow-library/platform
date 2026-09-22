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

const originalFetch = globalThis.fetch;

/** Restores the real `fetch` a prior `httpFake` replaced; call from `afterEach`. */
export function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

/** Stubs the global `fetch` the app transport sends through; call `restoreFetch()` in `afterEach`. */
export function httpFake(handlers: Record<string, (call: HttpCall, attempt: number) => HttpReply | Promise<HttpReply>>): HttpFake {
  const fake: HttpFake = { calls: [], count: (method, path) => fake.calls.filter(call => call.method === method && call.path === path).length };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://memoir.test').pathname;
    const method = init?.method ?? 'GET';
    const call: HttpCall = { method, path, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };

    const attempt = fake.count(method, path);
    fake.calls.push(call);

    const handler = handlers[`${method} ${path}`];
    if (!handler) return new Response(JSON.stringify({ code: 'TEST_404', type: 'NotFound', message: `no handler for ${method} ${path}` }), { status: 404 });

    const reply = await handler(call, attempt);
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;

  return fake;
}
