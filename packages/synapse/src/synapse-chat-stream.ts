import { AppError, ErrorCode } from '@shadow-library/common/errors';

import { STREAM_ERROR_STATUS } from './constants';
import { type SynapseChatChunk, type SynapseStreamFinal, type SynapseUsage } from './synapse-api.types';
import { parseSynapseError } from './synapse.error';
import { type SynapseResponseBlock } from './synapse.types';
import { isAbortError, isRecord, networkError, parseJson } from './synapse.utils';

const DONE = '[DONE]';

const incomplete = (reason: string): AppError => ErrorCode.API_REQUEST_NETWORK_ERROR.create({ reason });

async function* readEventData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read().catch((error: unknown) => {
        throw isAbortError(error) ? error : networkError(error);
      });
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? '' : (lines.pop() ?? '');
      for (const line of lines) {
        if (line.startsWith('data:')) data.push(line.slice(line.startsWith('data: ') ? 6 : 5));
        if (line !== '' || data.length === 0) continue;
        yield data.join('\n');
        data = [];
      }
      if (done) break;
    }
    if (data.length > 0) yield data.join('\n');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export class SynapseChatStream implements AsyncIterable<SynapseChatChunk> {
  private consumed = false;
  private readonly settled: Promise<SynapseStreamFinal>;
  private resolveFinal!: (value: SynapseStreamFinal) => void;
  private rejectFinal!: (reason: unknown) => void;

  constructor(private readonly body: ReadableStream<Uint8Array>) {
    this.settled = new Promise<SynapseStreamFinal>((resolve, reject) => {
      this.resolveFinal = resolve;
      this.rejectFinal = reject;
    });
    this.settled.catch(() => undefined);
  }

  [Symbol.asyncIterator](): AsyncGenerator<SynapseChatChunk> {
    if (this.consumed) throw AppError.internal('a synapse chat stream can be iterated only once');
    this.consumed = true;
    return this.frames();
  }

  final(): Promise<SynapseStreamFinal> {
    if (!this.consumed) this.drain().catch(() => undefined);
    return this.settled;
  }

  private async drain(): Promise<void> {
    const frames = this[Symbol.asyncIterator]();
    while (!(await frames.next()).done);
  }

  private async *frames(): AsyncGenerator<SynapseChatChunk> {
    let final: SynapseStreamFinal | undefined;
    try {
      for await (const data of readEventData(this.body)) {
        if (data === DONE) break;
        const frame = parseJson(data);
        if (!isRecord(frame)) throw incomplete('the synapse stream carried a frame that is not a json object');
        if (isRecord(frame.error)) throw parseSynapseError(STREAM_ERROR_STATUS, frame);
        if (isRecord(frame.synapse))
          final = { usage: isRecord(frame.usage) ? (frame.usage as unknown as SynapseUsage) : null, synapse: frame.synapse as unknown as SynapseResponseBlock };
        else yield frame as unknown as SynapseChatChunk;
      }
      if (!final) throw incomplete('the synapse stream ended before its final frame');
      this.resolveFinal(final);
    } catch (error) {
      this.rejectFinal(error);
      throw error;
    } finally {
      if (!final) this.rejectFinal(incomplete('the synapse stream was closed before its final frame'));
    }
  }
}
