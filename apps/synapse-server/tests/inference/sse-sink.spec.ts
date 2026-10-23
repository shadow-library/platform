import { describe, expect, it } from 'bun:test';

import { type SseHeaders, SseSink, type SseTarget } from '@modules/inference/sse-sink';

import { FakeTimers } from './inference.fixtures';

class FakeResponse implements SseTarget {
  destroyed = false;
  writableEnded = false;
  status?: number;
  headers?: SseHeaders;
  readonly written: string[] = [];
  accepts = true;
  private readonly listeners = new Map<string, Set<() => void>>();

  writeHead(status: number, headers: SseHeaders): void {
    this.status = status;
    this.headers = headers;
  }

  write(chunk: string): boolean {
    this.written.push(chunk);
    return this.accepts;
  }

  end(): void {
    this.writableEnded = true;
  }

  destroy(): void {
    this.destroyed = true;
  }

  once(event: string, listener: () => void): void {
    this.listeners.set(event, (this.listeners.get(event) ?? new Set()).add(listener));
  }

  off(event: string, listener: () => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((total, set) => total + set.size, 0);
  }
}

function sinkOver(response: FakeResponse, timers = new FakeTimers()): { sink: SseSink; hijacked: () => number; timers: FakeTimers; abort: AbortController } {
  let hijacks = 0;
  const abort = new AbortController();
  const reply = { raw: response, hijack: () => hijacks++, getHeaders: () => ({ 'content-length': '12', 'x-frame-options': 'DENY' }) };
  return { sink: new SseSink(reply, timers, abort.signal, 1000), hijacked: () => hijacks, timers, abort };
}

describe('SseSink', () => {
  it('should hijack the reply only when opened, keeping its headers and dropping the content length', () => {
    const response = new FakeResponse();
    const { sink, hijacked } = sinkOver(response);
    expect(hijacked()).toBe(0);

    sink.open();

    expect(hijacked()).toBe(1);
    expect(response.status).toBe(200);
    expect(response.headers).toEqual({
      'x-frame-options': 'DENY',
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    });
  });

  it('should write each frame as one server-sent event', async () => {
    const response = new FakeResponse();
    const { sink } = sinkOver(response);
    sink.open();

    expect(await sink.send('{"a":1}')).toBe('written');
    expect(await sink.send('[DONE]')).toBe('written');
    sink.end();

    expect(response.written).toEqual(['data: {"a":1}\n\n', 'data: [DONE]\n\n']);
    expect(response.writableEnded).toBe(true);
  });

  it('should wait for the buffer to drain before the next frame', async () => {
    const response = new FakeResponse();
    const { sink, timers } = sinkOver(response);
    sink.open();
    response.accepts = false;

    const sending = sink.send('x');
    await Promise.resolve();
    response.emit('drain');

    expect(await sending).toBe('written');
    expect(timers.delays[0]?.cancelled).toBe(true);
    expect(response.listenerCount()).toBe(0);
  });

  it('should cut a caller that stops reading past the write deadline', async () => {
    const response = new FakeResponse();
    const { sink, timers } = sinkOver(response);
    sink.open();
    response.accepts = false;

    const sending = sink.send('x');
    timers.delays[0]?.fire();

    expect(await sending).toBe('stalled');
    expect(timers.delays[0]?.delayMs).toBe(1000);
    expect(response.destroyed).toBe(true);
    expect(await sink.send('y')).toBe('stalled');
  });

  it('should report a caller that went away while the buffer was full', async () => {
    const response = new FakeResponse();
    const { sink } = sinkOver(response);
    sink.open();
    response.accepts = false;

    const sending = sink.send('x');
    response.emit('close');

    expect(await sending).toBe('closed');
  });

  it('should stop waiting for a full buffer, and cut the connection, once the request is aborted', async () => {
    const response = new FakeResponse();
    const { sink, timers, abort } = sinkOver(response);
    sink.open();
    response.accepts = false;

    const sending = sink.send('x');
    abort.abort();

    expect(await sending).toBe('closed');
    expect(response.destroyed).toBe(true);
    expect(timers.delays[0]?.cancelled).toBe(true);
    expect(response.listenerCount()).toBe(0);
  });

  it('should not wait at all on a full buffer when the request was already aborted', async () => {
    const response = new FakeResponse();
    const { sink, timers, abort } = sinkOver(response);
    sink.open();
    response.accepts = false;
    abort.abort();

    expect(await sink.send('x')).toBe('closed');
    expect([response.destroyed, timers.delays.length]).toEqual([true, 0]);
  });

  it('should write nothing to a response already closed', async () => {
    const response = new FakeResponse();
    const { sink } = sinkOver(response);
    sink.open();
    response.destroyed = true;

    expect(await sink.send('x')).toBe('closed');
    sink.end();
    expect([response.written, response.writableEnded]).toEqual([[], false]);
  });
});
