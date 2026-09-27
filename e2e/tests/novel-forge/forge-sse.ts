/**
 * Importing npm packages
 */
import { type ClientRequest, type IncomingMessage } from 'node:http';
import https from 'node:https';

import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { clientIpHeaders, requireProductUrl } from '../../lib';
import { expect, test as forgeTest } from './forge-actors';

/**
 * Defining types
 */

export interface SseFrame {
  readonly event: string;
  readonly data: string;
  readonly id?: string;
}

export interface SseOpenOptions {
  readonly headers?: Record<string, string>;
  readonly clientIp?: string;
  /** Receives the request's teardown before anything is awaited, so a caller can close a stream whose open never finishes. */
  readonly track?: (close: () => void) => void;
}

export interface SseStream {
  readonly status: number;
  /** The whole body of a refused open; empty for an open stream. */
  readonly body: string;
  readonly frames: readonly SseFrame[];
  /** Resolves with the frames once `done` accepts them, failing with `what` and the frames seen when the deadline passes first. */
  until(done: (frames: readonly SseFrame[]) => boolean, what: string, timeoutMs?: number): Promise<readonly SseFrame[]>;
  ended(timeoutMs?: number): Promise<readonly SseFrame[]>;
  close(): void;
}

export interface SseClient {
  /** Opens `path` on Novel Forge with `ctx`'s cookies, charged to the test's own client address; closed after the test. */
  open(ctx: APIRequestContext, path: string, options?: Pick<SseOpenOptions, 'headers'>): Promise<SseStream>;
}

/**
 * Declaring the constants
 *
 * A server-sent event reader for Novel Forge's streams. `APIRequestContext` buffers a body until it ends, and a project's event stream never
 * ends on its own, so a stream is read over a raw HTTPS request instead, carrying the context's cookies. Frames are parsed as the SSE
 * spec dispatches them: a block without data (the opening `retry:`) and comment lines (heartbeats) produce no frame.
 */

const DEFAULT_WAIT_MS = 15_000;

/** Longest wait for response headers; cleared once they arrive, since an open stream may idle between heartbeats. */
const HEADERS_TIMEOUT_MS = 15_000;

const FRAME_BREAK = /\r\n\r\n|\n\n|\r\r/;

const LINE_BREAK = /\r\n|\r|\n/;

export class SseTimeoutError extends Error {
  override readonly name = 'SseTimeoutError';
}

function parseFrame(block: string): SseFrame | undefined {
  let event = 'message';
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split(LINE_BREAK)) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'id') id = value;
    else if (field === 'data') data.push(value);
  }
  if (data.length === 0) return undefined;
  return { event, data: data.join('\n'), ...(id === undefined ? {} : { id }) };
}

async function cookieHeader(ctx: APIRequestContext, url: URL): Promise<string> {
  const { cookies } = await ctx.storageState();
  const matches = cookies.filter(cookie => {
    const domain = cookie.domain.replace(/^\./, '');
    const onHost = url.hostname === domain || url.hostname.endsWith(`.${domain}`);
    return onHost && url.pathname.startsWith(cookie.path) && (cookie.expires < 0 || cookie.expires * 1000 > Date.now());
  });
  return matches.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

class LiveSseStream implements SseStream {
  body = '';
  readonly frames: SseFrame[] = [];
  private buffer = '';
  private isEnded = false;
  private readonly waiters = new Set<() => void>();

  constructor(
    private readonly request: ClientRequest,
    readonly status: number,
  ) {}

  attach(response: IncomingMessage): void {
    response.setEncoding('utf8');
    response.on('data', (chunk: string) => (this.status === 200 ? this.feed(chunk) : (this.body += chunk)));
    response.on('end', () => this.finish());
    response.on('close', () => this.finish());
    response.on('error', () => this.finish());
  }

  until(done: (frames: readonly SseFrame[]) => boolean, what: string, timeoutMs = DEFAULT_WAIT_MS): Promise<readonly SseFrame[]> {
    return new Promise((resolve, reject) => {
      const check = (): void => {
        if (done(this.frames)) return settle(() => resolve([...this.frames]));
        if (this.isEnded) settle(() => reject(new SseTimeoutError(`the stream ended before ${what}; frames: ${JSON.stringify(this.frames)}`)));
      };
      const timer = setTimeout(
        () => settle(() => reject(new SseTimeoutError(`timed out after ${timeoutMs} ms waiting for ${what}; frames: ${JSON.stringify(this.frames)}`))),
        timeoutMs,
      );
      const settle = (outcome: () => void): void => {
        clearTimeout(timer);
        this.waiters.delete(check);
        outcome();
      };
      this.waiters.add(check);
      check();
    });
  }

  async ended(timeoutMs = DEFAULT_WAIT_MS): Promise<readonly SseFrame[]> {
    return this.until(() => this.isEnded, 'the server to end the stream', timeoutMs);
  }

  close(): void {
    this.request.destroy();
    this.finish();
  }

  private feed(chunk: string): void {
    this.buffer += chunk;
    const blocks = this.buffer.split(FRAME_BREAK);
    this.buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const frame = parseFrame(block);
      if (frame) this.frames.push(frame);
    }
    this.notify();
  }

  private finish(): void {
    if (this.isEnded) return;
    this.isEnded = true;
    this.notify();
  }

  private notify(): void {
    for (const waiter of [...this.waiters]) waiter();
  }
}

/** Resolves once the response headers arrive; a refused open has read its whole body by then. */
export async function openSse(ctx: APIRequestContext, path: string, options: SseOpenOptions = {}): Promise<SseStream> {
  const url = new URL(path, requireProductUrl('novelForge'));
  const headers: Record<string, string> = { accept: 'text/event-stream', ...(options.clientIp ? clientIpHeaders(options.clientIp) : {}), ...options.headers };
  const cookie = await cookieHeader(ctx, url);
  if (cookie) headers['cookie'] = cookie;

  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: 'GET', headers, rejectUnauthorized: false }, response => {
      request.setTimeout(0);
      const stream = new LiveSseStream(request, response.statusCode ?? 0);
      stream.attach(response);
      if (stream.status === 200) return resolve(stream);
      response.on('end', () => resolve(stream));
      response.on('close', () => resolve(stream));
      response.on('error', reject);
    });
    options.track?.(() => request.destroy());
    request.setTimeout(HEADERS_TIMEOUT_MS, () => request.destroy(new SseTimeoutError(`no response headers for ${path} within ${HEADERS_TIMEOUT_MS} ms`)));
    request.on('error', reject);
    request.end();
  });
}

/** Asserts an open was refused before the stream started, with `code` in its JSON body. */
export function expectRefusedStream(stream: SseStream, status: number, code: string, what: string): void {
  expect(stream.status, `${what} — body ${stream.body}`).toBe(status);
  expect((JSON.parse(stream.body || '{}') as { code?: string }).code, what).toBe(code);
}

/** The frames of one event, each parsed as JSON. */
export function framesOf<T>(frames: readonly SseFrame[], event: string): T[] {
  return frames.filter(frame => frame.event === event).map(frame => JSON.parse(frame.data) as T);
}

export const test = forgeTest.extend<{ sse: SseClient }>({
  sse: async ({ forge }, use) => {
    const closers: (() => void)[] = [];
    await use({ open: (ctx, path, options = {}) => openSse(ctx, path, { ...options, clientIp: forge.clientIp, track: close => closers.push(close) }) });
    for (const close of closers) close();
  },
});

export { expect } from './forge-actors';
