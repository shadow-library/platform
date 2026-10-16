import { classifyPayloadError, ProviderCallError, upstreamErrorOf } from './provider-call.error';
import { type JsonObject, type NormalizedUsage } from './provider.types';
import { asRecord, callerPayload, parseJson } from './upstream-payload.util';
import { parseServedModel, parseUsage } from './usage.util';

export interface ChatStreamState {
  usage?: NormalizedUsage;
  servedModel?: string;
  done: boolean;
  finished: boolean;
  chunks: number;
}

export interface ChatChunkOptions {
  signal?: AbortSignal;
  /** Replaces each chunk's `model`, so the caller sees the task id rather than the vendor's slug */
  responseModel?: string;
  withCost?: boolean;
}

const DONE = '[DONE]';

class SseLineDecoder {
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private data: string[] = [];
  /** The last read ended on a CR, so an LF opening the next one is the rest of that CRLF */
  private afterCr = false;

  push(bytes: Uint8Array): string[] {
    this.buffer += this.decoder.decode(bytes, { stream: true });
    return this.drain();
  }

  end(): string[] {
    this.buffer += this.decoder.decode();
    const events = this.drain();
    if (this.buffer.length > 0) this.line(this.buffer, events);
    this.buffer = '';
    if (this.data.length > 0) events.push(this.data.join('\n'));
    this.data = [];
    return events;
  }

  private drain(): string[] {
    const events: string[] = [];
    if (this.buffer.length === 0) return events;
    let start = this.afterCr && this.buffer.startsWith('\n') ? 1 : 0;
    this.afterCr = false;
    for (let index = start; index < this.buffer.length; index++) {
      const char = this.buffer[index];
      if (char !== '\n' && char !== '\r') continue;
      this.line(this.buffer.slice(start, index), events);
      if (char === '\r' && index === this.buffer.length - 1) this.afterCr = true;
      else if (char === '\r' && this.buffer[index + 1] === '\n') index++;
      start = index + 1;
    }
    this.buffer = this.buffer.slice(start);
    return events;
  }

  private line(line: string, events: string[]): void {
    if (line.length === 0) {
      if (this.data.length > 0) events.push(this.data.join('\n'));
      this.data = [];
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== 'data') return;
    const value = colon === -1 ? '' : line.slice(colon + 1);
    this.data.push(value.startsWith(' ') ? value.slice(1) : value);
  }
}

/**
 * The `data` payload of each event of a `text/event-stream`, multi-line data joined by newlines and comments skipped. An event the stream
 * ends without terminating is still delivered. Aborting `signal` cancels the read and ends the iteration quietly; the caller reads the reason.
 */
export async function* readSseData(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new SseLineDecoder();
  const cancel = (): void => void reader.cancel().catch(() => undefined);
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of decoder.push(value)) {
        if (signal?.aborted) return;
        yield event;
      }
    }
    for (const event of decoder.end()) {
      if (signal?.aborted) return;
      yield event;
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    cancel();
  }
}

function frameOf(data: string, bytesSent: boolean): JsonObject {
  const frame = asRecord(parseJson(data));
  if (!frame) throw new ProviderCallError({ retryable: false, bytesSent, code: 'invalid_response', message: 'The upstream sent a malformed stream frame' });
  return frame;
}

function sawFinish(choices: unknown[]): boolean {
  return choices.some(choice => typeof asRecord(choice)?.['finish_reason'] === 'string');
}

/**
 * The content chunks of an OpenAI-style chat stream, as `callerPayload`s; usage and the gateway block are read from any frame, the last
 * seen winning, and choice-less frames are never yielded. An error frame, a malformed frame or a stream that ends with neither `[DONE]`
 * nor a finish reason throws, whatever usage it reported.
 */
export async function* readChatChunks(stream: ReadableStream<Uint8Array>, state: ChatStreamState, options: ChatChunkOptions = {}): AsyncGenerator<JsonObject> {
  for await (const data of readSseData(stream, options.signal)) {
    if (options.signal?.aborted) return;
    if (data.trim() === DONE) {
      state.done = true;
      return;
    }
    const frame = frameOf(data, state.chunks > 0);
    const error = upstreamErrorOf(frame);
    if (error) throw classifyPayloadError(error, state.chunks > 0);

    const usage = parseUsage(frame['usage'], { withCost: options.withCost ?? false });
    if (usage) state.usage = usage;
    const servedModel = parseServedModel(frame);
    if (servedModel) state.servedModel = servedModel;

    const choices = frame['choices'];
    if (!Array.isArray(choices) || choices.length === 0) continue;
    if (sawFinish(choices)) state.finished = true;
    state.chunks++;
    yield callerPayload(frame, options.responseModel);
  }
  if (options.signal?.aborted || state.done || state.finished) return;
  throw new ProviderCallError({ retryable: false, bytesSent: state.chunks > 0, code: 'stream_truncated', message: 'The upstream stream ended before it finished' });
}
