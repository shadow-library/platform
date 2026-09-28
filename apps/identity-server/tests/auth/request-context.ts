import { ContextService } from '@shadow-library/fastify';

import { ContextBinder } from '@server/modules/access';

export interface FakeReply {
  readonly headers: Map<string, string>;
  header(name: string, value: string): FakeReply;
}

export function fakeReply(): FakeReply {
  const headers = new Map<string, string>();
  const reply: FakeReply = {
    headers,
    header: (name, value) => {
      headers.set(name.toLowerCase(), value);
      return reply;
    },
  };
  return reply;
}

/** Runs `work` inside the ambient request context the services read through `Context`, as the real `onRequest` hook would. */
export function withinRequest<T>(work: () => Promise<T>, reply: FakeReply = fakeReply(), ip = '198.51.100.7'): Promise<T> {
  const context = new ContextService();
  new ContextBinder(context);
  const request = { id: 'test-request', ip, headers: {} };
  return new Promise<T>((resolve, reject) => context.init().call(undefined as never, request as never, reply as never, () => void work().then(resolve, reject)));
}
