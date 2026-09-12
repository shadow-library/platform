/**
 * Importing npm packages
 */
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { HttpResponse } from '../interfaces';

/**
 * Defining types
 */

export interface EventStreamOptions {
  /** Interval for the comment line an idle stream writes so proxy idle timeouts never cut it. Defaults to 20 seconds; `0` disables it. */
  heartbeatMs?: number;
  /** Ends the stream after this long, sending the client back through the route's guards: an open stream is never re-authorised. Defaults to 15 minutes; `0` never ends it. */
  maxLifetimeMs?: number;
  /** Reconnect delay the client is told to use, sent as the stream's `retry` field. Defaults to 3 seconds. */
  retryMs?: number;
}

export interface EventStreamMessage {
  /** Event name the client dispatches on; omitted, the browser delivers it as a plain `message`. */
  event?: string;
  /** A string is sent as-is, one `data` field per line; anything else is sent as JSON. */
  data: unknown;
  /** Becomes the client's `Last-Event-ID` when it reconnects. */
  id?: string;
}

type HttpServer = HttpResponse['server'];

/**
 * Declaring the constants
 */
const DEFAULT_HEARTBEAT_MS = 20_000;
const DEFAULT_MAX_LIFETIME_MS = 15 * 60_000;
const DEFAULT_RETRY_MS = 3_000;
const LINE_BREAK = /\r\n|\r|\n/;

/**
 * A server-sent event stream on a route's own response. The reply is hijacked, so Fastify's `onSend` hooks — response
 * compression among them, which would hold events back in its buffer — never see the stream, and the route's return
 * value is ignored. Headers already set on the reply (cookies, security headers) are carried onto the stream.
 */
export class EventStream {
  /** A connected stream never ends on its own, and Fastify's `close()` waits for it: the router ends these first. */
  private static readonly openStreams = new WeakMap<HttpServer, Set<EventStream>>();

  private readonly closeListeners = new Set<() => void>();
  private readonly heartbeat?: ReturnType<typeof setInterval>;
  private readonly lifetime?: ReturnType<typeof setTimeout>;
  private readonly onDisconnect = (): void => this.teardown();
  private isClosed = false;

  private constructor(
    private readonly response: HttpResponse,
    options: EventStreamOptions,
  ) {
    const { heartbeatMs = DEFAULT_HEARTBEAT_MS, maxLifetimeMs = DEFAULT_MAX_LIFETIME_MS, retryMs = DEFAULT_RETRY_MS } = options;
    response.hijack();
    const headers = { ...response.getHeaders(), 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' };
    delete headers['content-length'];
    response.raw.writeHead(200, headers as Record<string, string | string[]>);
    response.raw.write(`retry: ${retryMs}\n\n`);

    // A client disconnect surfaces differently per runtime: Node closes the response, Bun only the socket (and the
    // request, which Node also closes as soon as a body-less request has been read, so it cannot be used).
    response.raw.on('close', this.onDisconnect);
    response.request.raw.socket?.on('close', this.onDisconnect);
    if (heartbeatMs > 0) this.heartbeat = setInterval(() => response.raw.write(': heartbeat\n\n'), heartbeatMs);
    if (maxLifetimeMs > 0) this.lifetime = setTimeout(() => this.close(), maxLifetimeMs);

    const streams = EventStream.openStreams.get(response.server) ?? new Set();
    EventStream.openStreams.set(response.server, streams.add(this));
  }

  static open(response: HttpResponse, options: EventStreamOptions = {}): EventStream {
    return new EventStream(response, options);
  }

  /** Ends every stream still open on this server, so a graceful shutdown is not held open by connected clients. */
  static closeAll(server: HttpServer): void {
    for (const stream of EventStream.openStreams.get(server) ?? []) stream.close();
  }

  get closed(): boolean {
    return this.isClosed;
  }

  /** Returns `false` once the stream has closed, so a publisher can drop a subscriber that outlived its client. */
  send(message: EventStreamMessage): boolean {
    if (this.isClosed) return false;
    if (message.event !== undefined && LINE_BREAK.test(message.event)) throw AppError.internal(`event stream event name '${message.event}' contains a line break`);
    if (message.id !== undefined && LINE_BREAK.test(message.id)) throw AppError.internal(`event stream id '${message.id}' contains a line break`);

    const payload = typeof message.data === 'string' ? message.data : JSON.stringify(message.data);
    let frame = message.id === undefined ? '' : `id: ${message.id}\n`;
    if (message.event !== undefined) frame += `event: ${message.event}\n`;
    for (const line of payload.split(LINE_BREAK)) frame += `data: ${line}\n`;
    this.response.raw.write(`${frame}\n`);
    return true;
  }

  /** Runs once when the stream ends for any reason; registered after it has ended, it runs immediately. */
  onClose(listener: () => void): void {
    if (this.isClosed) listener();
    else this.closeListeners.add(listener);
  }

  close(): void {
    if (this.isClosed) return;
    this.teardown();
    this.response.raw.end();
  }

  private teardown(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    clearInterval(this.heartbeat);
    clearTimeout(this.lifetime);
    this.response.raw.off('close', this.onDisconnect);
    this.response.request.raw.socket?.off('close', this.onDisconnect);
    EventStream.openStreams.get(this.response.server)?.delete(this);
    for (const listener of this.closeListeners) listener();
    this.closeListeners.clear();
  }
}
