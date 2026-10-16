import { type ServiceTokenOptions } from '@shadow-library/auth';
import { AppError } from '@shadow-library/common';
import { type SynapseFetch } from '@shadow-library/synapse';

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | undefined;
}

type Reply = (url: string) => Response;

/** Shaped like Bun's own fetch failure on a refused connection: a plain `Error` carrying `code`, `path` and `errno` */
export class ConnectionRefusedError extends Error {
  readonly code = 'ConnectionRefused';
  readonly errno = 0;

  constructor(readonly path: string) {
    super('Unable to connect. Is the computer able to access the url?');
  }
}

export class FakeAuthClient {
  readonly requests: ServiceTokenOptions[] = [];
  private minted = 0;

  getServiceToken(options: ServiceTokenOptions = {}): Promise<string> {
    this.requests.push(options);
    return Promise.resolve(`token-${++this.minted}`);
  }
}

export class FakeSynapse {
  readonly requests: RecordedRequest[] = [];
  private readonly replies: Reply[] = [];

  reply(...responses: Reply[]): this {
    this.replies.push(...responses);
    return this;
  }

  refuseConnection(times = 1): this {
    for (let i = 0; i < times; i++) {
      this.replies.push(url => {
        throw new ConnectionRefusedError(url);
      });
    }
    return this;
  }

  readonly fetch: SynapseFetch = async (input, init = {}) => {
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const url = input instanceof Request ? input.url : String(input);
    this.requests.push({ url, method: init.method ?? 'GET', headers: new Headers(init.headers), body });
    const next = this.replies.shift();
    if (!next) throw AppError.internal('the fake synapse has no reply queued');
    return next(url);
  };
}

export const json =
  (body: unknown, status = 200, headers: Record<string, string> = {}): Reply =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const text =
  (body: string, status: number): Reply =>
  () =>
    new Response(body, { status });

export const failingBody =
  (status: number, prefix: string, error: Error): Reply =>
  () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(prefix));
          controller.error(error);
        },
      }),
      { status, headers: { 'content-type': 'text/event-stream' } },
    );

/** Serialises frames as SSE and delivers them in fixed-size byte slices, so events straddle chunk boundaries */
export function sse(frames: (string | object)[], { sliceBytes = 7, newline = '\n' }: { sliceBytes?: number; newline?: string } = {}): Reply {
  const payload = frames.map(frame => `data: ${typeof frame === 'string' ? frame : JSON.stringify(frame)}${newline}${newline}`).join('');
  return () => {
    const bytes = new TextEncoder().encode(payload);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += sliceBytes) controller.enqueue(bytes.slice(offset, offset + sliceBytes));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
}
