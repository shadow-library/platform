/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';

import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Importing user defined packages
 */
import { EventStream, type EventStreamOptions, type HttpResponse } from '@shadow-library/fastify';

/**
 * Defining types
 */

interface OpenedStream {
  response: Response;
  read: (until: (text: string) => boolean, timeoutMs?: number) => Promise<string>;
  disconnect: () => void;
  stream: () => EventStream;
}

/**
 * Declaring the constants
 */

describe('EventStream', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) EventStream.closeAll(app);
    await app?.close();
    app = undefined;
  });

  async function openStream(options: EventStreamOptions = {}, prepare?: (response: HttpResponse) => void): Promise<OpenedStream> {
    let stream: EventStream | undefined;
    app = Fastify();
    app.get('/events', (_request, reply) => {
      prepare?.(reply);
      stream = EventStream.open(reply, options);
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };

    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}/events`, { headers: { 'accept-encoding': 'gzip' }, signal: controller.signal });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let received = '';

    const read = async (until: (text: string) => boolean, timeoutMs = 2_000): Promise<string> => {
      const deadline = Date.now() + timeoutMs;
      while (!until(received)) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`stream never matched; received so far: ${JSON.stringify(received)}`);
        const chunk = await Promise.race([reader.read(), Bun.sleep(remaining).then(() => null)]);
        if (!chunk || chunk.done) break;
        received += decoder.decode(chunk.value, { stream: true });
      }
      return received;
    };

    return { response, read, disconnect: () => controller.abort(), stream: () => stream as EventStream };
  }

  it('should send event-stream headers and keep headers already set on the reply', async () => {
    const { response, read } = await openStream({}, reply => reply.header('set-cookie', 'csrf-token=abc; Path=/'));

    await read(text => text.includes('retry:'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('set-cookie')).toContain('csrf-token=abc');
  });

  it('should write the reconnect hint before any event', async () => {
    const { read } = await openStream({ retryMs: 4_500 });

    expect(await read(text => text.includes('\n\n'))).toBe('retry: 4500\n\n');
  });

  it('should frame an event with its id, name and JSON data', async () => {
    const { read, stream } = await openStream();
    await read(text => text.includes('retry:'));

    expect(stream().send({ id: '7', event: 'run', data: { runId: 'r1', status: 'completed' } })).toBe(true);

    expect(await read(text => text.includes('data:'))).toEndWith('id: 7\nevent: run\ndata: {"runId":"r1","status":"completed"}\n\n');
  });

  it('should put each line of a string payload on its own data field', async () => {
    const { read, stream } = await openStream();
    await read(text => text.includes('retry:'));

    stream().send({ data: 'first\nsecond' });

    expect(await read(text => text.includes('second'))).toEndWith('data: first\ndata: second\n\n');
  });

  it('should refuse an event name that would break the frame', async () => {
    const { read, stream } = await openStream();
    await read(text => text.includes('retry:'));

    expect(() => stream().send({ event: 'run\ndata: forged', data: {} })).toThrow();
  });

  it('should write a heartbeat comment while the stream is idle', async () => {
    const { read } = await openStream({ heartbeatMs: 50 });

    expect(await read(text => text.includes(': heartbeat'))).toContain(': heartbeat\n\n');
  });

  it('should end the stream once its maximum lifetime passes', async () => {
    const { read, stream } = await openStream({ maxLifetimeMs: 100, heartbeatMs: 0 });

    await read(() => false, 400).catch(() => undefined);

    expect(stream().closed).toBe(true);
    expect(stream().send({ data: 'late' })).toBe(false);
  });

  it('should notify close listeners when the client disconnects, and not before', async () => {
    const { read, stream, disconnect } = await openStream({ heartbeatMs: 0 });
    await read(text => text.includes('retry:'));
    let closes = 0;
    stream().onClose(() => closes++);

    await Bun.sleep(150);
    expect(closes).toBe(0);

    disconnect();
    for (let wait = 0; wait < 40 && closes === 0; wait++) await Bun.sleep(10);

    expect(closes).toBe(1);
    expect(stream().closed).toBe(true);
  });

  it('should call a close listener registered after the stream has already closed', async () => {
    const { read, stream } = await openStream({ heartbeatMs: 0 });
    await read(text => text.includes('retry:'));
    stream().close();
    let closes = 0;

    stream().onClose(() => closes++);

    expect(closes).toBe(1);
  });

  it('should end every open stream on its server so a shutdown is not held open by connected clients', async () => {
    const { read, stream } = await openStream({ heartbeatMs: 0 });
    await read(text => text.includes('retry:'));

    EventStream.closeAll(app as FastifyInstance);
    const closing = Date.now();
    await app?.close();
    app = undefined;

    expect(stream().closed).toBe(true);
    expect(Date.now() - closing).toBeLessThan(1_000);
  });
});
