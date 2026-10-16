import { SynapseClient, type SynapseFetch, type SynapseResponseBlock } from '@shadow-library/synapse';

export interface SentRequest {
  url: string;
  body: Record<string, unknown> | undefined;
  signal: AbortSignal | undefined;
}

type Reply = (request: SentRequest) => Response | Promise<Response>;

export const SYNAPSE_BLOCK: SynapseResponseBlock = {
  request_id: 'echoed',
  task: 'novel-forge.helper',
  alias: null,
  label: 'GPT Luna',
  model: 'gpt-5.6-luna',
  provider: 'openrouter',
  effort: 'low',
  attempts: 1,
  catalog_version: 3,
  cost: { list_usd: 0.004, billed_usd: 0.004 },
};

const USAGE = { prompt_tokens: 1200, completion_tokens: 30, total_tokens: 1230, prompt_tokens_details: { cached_tokens: 0 } };

export function completion(content: string, synapse: SynapseResponseBlock = SYNAPSE_BLOCK): Record<string, unknown> {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1_760_000_000,
    model: synapse.task,
    choices: [{ index: 0, message: { role: 'assistant', content, refusal: null }, finish_reason: 'stop', logprobs: null }],
    usage: USAGE,
    synapse,
  };
}

export const json =
  (body: unknown, status = 200): Reply =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const synapseError = (status: number, code: string): Reply => json({ error: { message: `refused with ${code}`, type: 'synapse_error', code } }, status);

export function stream(texts: string[], synapse: SynapseResponseBlock = SYNAPSE_BLOCK): Reply {
  const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1_760_000_000,
    model: synapse.task,
    choices: [{ index: 0, delta, finish_reason: finish, logprobs: null }],
  });
  const frames = [...texts.map(content => chunk({ content })), chunk({}, 'stop'), { ...chunk({}), choices: [], usage: USAGE, synapse }];
  const payload = [...frames.map(frame => JSON.stringify(frame)), '[DONE]'].map(frame => `data: ${frame}\n\n`).join('');
  return () => new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Never answers; rejects with the request's own abort reason once its signal fires, as a real fetch does. */
export const hang: Reply = ({ signal }) =>
  new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason));
  });

export const refuseConnection: Reply = () => {
  throw Object.assign(new Error('Unable to connect. Is the computer able to access the url?'), { code: 'ConnectionRefused' });
};

export class FakeSynapse {
  readonly requests: SentRequest[] = [];
  readonly catalogRequests: SentRequest[] = [];
  private readonly replies: Reply[] = [];
  private catalogReply?: Reply;
  private notify?: () => void;

  readonly client = new SynapseClient({ authClient: { getServiceToken: async () => 'm2m-token' }, fetch: (input, init) => this.fetch(input, init) });

  reply(...replies: Reply[]): this {
    this.replies.push(...replies);
    return this;
  }

  /** Answers every `GET /catalog` with `reply`, kept apart from the queued inference replies and their recorded requests. */
  answerCatalog(reply: Reply): this {
    this.catalogReply = reply;
    return this;
  }

  /** Resolves once the next request reaches the fake. */
  sent(): Promise<void> {
    return new Promise(resolve => (this.notify = resolve));
  }

  private readonly fetch: SynapseFetch = async (input, init = {}) => {
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const request = { url: input instanceof Request ? input.url : String(input), body, signal: init.signal ?? undefined };
    if (this.catalogReply && new URL(request.url).pathname.endsWith('/catalog')) {
      this.catalogRequests.push(request);
      return this.catalogReply(request);
    }
    this.requests.push(request);
    this.notify?.();
    const next = this.replies.shift();
    if (!next) throw new Error('the fake synapse has no reply queued');
    return next(request);
  };
}
