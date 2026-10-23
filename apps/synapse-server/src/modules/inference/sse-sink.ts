import { type CatalogTimers } from '@modules/catalog';

export type SseHeaders = Record<string, number | string | string[] | undefined>;

export interface SseTarget {
  readonly destroyed: boolean;
  readonly writableEnded: boolean;
  writeHead(status: number, headers: SseHeaders): unknown;
  write(chunk: string): boolean;
  end(): unknown;
  destroy(): unknown;
  once(event: 'drain' | 'close', listener: () => void): unknown;
  off(event: 'drain' | 'close', listener: () => void): unknown;
}

export interface SseReply {
  readonly raw: SseTarget;
  hijack(): unknown;
  getHeaders(): SseHeaders;
}

/** `closed`: the caller went away; `stalled`: it stopped reading for longer than the write deadline */
export type SseWriteResult = 'written' | 'closed' | 'stalled';

/** Where dispatch writes a stream once it has committed to it; nothing reaches the caller before `open` */
export interface ChatStreamSink {
  open(): void;
  send(data: string): Promise<SseWriteResult>;
  end(): void;
}

export const STREAM_WRITE_TIMEOUT_MS = 30_000;

const SSE_HEADERS: SseHeaders = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' };

/**
 * The reply is hijacked only on `open`, so a call that fails before its first chunk still answers through the error handler. Each frame is
 * written straight to the socket; a full buffer waits for `drain` at most the write deadline, after which the stream is cut, because a
 * caller that stops reading would otherwise hold the call, and the provider's in-flight slot, until the request timeout.
 */
export class SseSink implements ChatStreamSink {
  private failure: Exclude<SseWriteResult, 'written'> | undefined;
  private target: SseTarget | undefined;

  constructor(
    private readonly reply: SseReply,
    private readonly timers: CatalogTimers,
    private readonly signal: AbortSignal,
    private readonly writeTimeoutMs = STREAM_WRITE_TIMEOUT_MS,
  ) {}

  open(): void {
    if (this.target) return;
    this.reply.hijack();
    const headers: SseHeaders = { ...this.reply.getHeaders(), ...SSE_HEADERS };
    delete headers['content-length'];
    this.target = this.reply.raw;
    this.target.writeHead(200, headers);
  }

  async send(data: string): Promise<SseWriteResult> {
    const target = this.target;
    if (!target) return 'closed';
    if (this.failure) return this.failure;
    if (target.destroyed || target.writableEnded) return (this.failure = 'closed');

    let flushed: boolean;
    try {
      flushed = target.write(`data: ${data}\n\n`);
    } catch {
      return (this.failure = 'closed');
    }
    if (flushed) return 'written';
    const outcome = await this.drained(target);
    if (outcome === 'written') return outcome;
    this.failure = outcome;
    if (!target.destroyed) target.destroy();
    return outcome;
  }

  end(): void {
    const target = this.target;
    if (!target || target.destroyed || target.writableEnded) return;
    target.end();
  }

  /** A request aborted while its frame waits in a full buffer is not given the rest of the write deadline */
  private drained(target: SseTarget): Promise<SseWriteResult> {
    if (this.signal.aborted) return Promise.resolve('closed');
    return new Promise(resolve => {
      const deadline = this.timers.after(this.writeTimeoutMs);
      const finish = (outcome: SseWriteResult): void => {
        target.off('drain', onDrain);
        target.off('close', onClose);
        this.signal.removeEventListener('abort', onAbort);
        deadline.cancel();
        resolve(outcome);
      };
      const onDrain = (): void => finish('written');
      const onClose = (): void => finish('closed');
      const onAbort = (): void => finish('closed');
      target.once('drain', onDrain);
      target.once('close', onClose);
      this.signal.addEventListener('abort', onAbort, { once: true });
      void deadline.elapsed.then(() => finish('stalled'));
    });
  }
}
