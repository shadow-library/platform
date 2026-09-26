import { type CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { type BaseMessage } from '@langchain/core/messages';
import { type ChatGenerationChunk } from '@langchain/core/outputs';
import { ChatOpenAI, ChatOpenAICompletions, type ChatOpenAIFields, ChatOpenAIResponses, type OpenAIClient } from '@langchain/openai';

export interface RawGatewayInfo {
  served_by?: string;
  served_model?: string;
  openrouter?: boolean;
}

export type GatewayFrame = Record<string, unknown> & { gateway?: RawGatewayInfo };

interface GatewayBox {
  gateway?: RawGatewayInfo;
}

export interface RequestGuard {
  /** Runs on the outgoing wire messages immediately before the request is sent, and throws to stop it being sent at all. */
  screen: (messages: readonly { content?: unknown }[]) => void;
  /** Sent as the first system message of every request. */
  systemLine: string;
}

const GATEWAY_BOX = Symbol('gatewayBox');

// The gateway's own frame — the one carrying `gateway` — has no `choices`, so @langchain/openai 1.5.5's
// completions stream loop (`if (!choice) continue`) skips it before any callback ever sees it. This walks
// the raw frames as they pass through `completionWithRetry` and remembers the last `gateway` object seen,
// for `stampGatewayOnUsageChunk` to attach to the one chunk that survives the loop.
export async function* tapGatewayFrames<T extends GatewayFrame>(frames: AsyncIterable<T>, onGateway: (gateway: RawGatewayInfo) => void): AsyncGenerator<T> {
  for await (const frame of frames) {
    if (frame.gateway) onGateway(frame.gateway);
    yield frame;
  }
}

// After its loop over the raw frames ends, the base implementation emits exactly one further chunk with no
// message content and `usage_metadata` set from the choice-less usage frame — the same frame the gateway
// object arrived on, and the only chunk in the whole stream that ever sets `usage_metadata`. Stamping
// `gateway` onto it here lands the value once rather than depending on how chunk-concatenation resolves it.
export function stampGatewayOnUsageChunk(chunk: ChatGenerationChunk, gateway: RawGatewayInfo | undefined): void {
  const usageMetadata = (chunk.message as { usage_metadata?: unknown }).usage_metadata;
  if (!gateway || !usageMetadata) return;
  const responseMetadata = (chunk.message.response_metadata as Record<string, unknown> | undefined) ?? {};
  chunk.message.response_metadata = { ...responseMetadata, gateway };
}

/**
 * The `ChatOpenAICompletions` delegate `GatewayChatOpenAI` installs via `fields.completions` — which is what
 * actually survives `ChatOpenAI.withConfig()` (hardcoded to `new ChatOpenAI(this.fields)`, discarding any
 * subclass, but still reading `fields.completions` off that same fields object) and `.bindTools()` (a
 * `RunnableBinding` around the same instance). A streamed call's tapped `gateway` is correlated with its own
 * `_streamResponseChunks` invocation through a box stashed on that call's own `options` object (the same
 * object reference `_streamResponseChunks` hands to `completionWithRetry`), never on `this` — so two
 * concurrent streams sharing this one delegate can never cross-wire.
 */
class GatewayTappingCompletions extends ChatOpenAICompletions {
  constructor(
    fields: ChatOpenAIFields | undefined,
    private readonly guard?: RequestGuard,
  ) {
    super(fields);
  }

  override completionWithRetry(
    request: OpenAIClient.Chat.ChatCompletionCreateParamsStreaming,
    requestOptions?: OpenAIClient.RequestOptions,
  ): Promise<AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk>>;
  override completionWithRetry(
    request: OpenAIClient.Chat.ChatCompletionCreateParamsNonStreaming,
    requestOptions?: OpenAIClient.RequestOptions,
  ): Promise<OpenAIClient.Chat.Completions.ChatCompletion>;
  override async completionWithRetry(
    request: OpenAIClient.Chat.ChatCompletionCreateParamsStreaming | OpenAIClient.Chat.ChatCompletionCreateParamsNonStreaming,
    requestOptions?: OpenAIClient.RequestOptions,
  ): Promise<AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk> | OpenAIClient.Chat.Completions.ChatCompletion> {
    if (this.guard) {
      this.guard.screen(request.messages);
      request = { ...request, messages: [{ role: 'system', content: this.guard.systemLine }, ...request.messages] };
    }
    if (!request.stream) return super.completionWithRetry(request, requestOptions);
    const result = await super.completionWithRetry(request, requestOptions);
    const box = (requestOptions as Record<symbol, GatewayBox> | undefined)?.[GATEWAY_BOX];
    if (!box) return result;
    return tapGatewayFrames(
      result as unknown as AsyncIterable<GatewayFrame>,
      gateway => (box.gateway = gateway),
    ) as unknown as AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk>;
  }

  override async *_streamResponseChunks(messages: BaseMessage[], options: this['ParsedCallOptions'], runManager?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk> {
    const box: GatewayBox = {};
    (options as Record<symbol, GatewayBox>)[GATEWAY_BOX] = box;
    for await (const chunk of super._streamResponseChunks(messages, options, runManager)) {
      stampGatewayOnUsageChunk(chunk, box.gateway);
      yield chunk;
    }
  }
}

// ChatOpenAI switches a call to the Responses API on its own for some models and options, so the guard has to sit on that delegate too.
class GuardedResponses extends ChatOpenAIResponses {
  constructor(
    fields: ChatOpenAIFields | undefined,
    private readonly guard: RequestGuard,
  ) {
    super(fields);
  }

  override completionWithRetry(
    request: OpenAIClient.Responses.ResponseCreateParamsStreaming,
    requestOptions?: OpenAIClient.RequestOptions,
  ): Promise<AsyncIterable<OpenAIClient.Responses.ResponseStreamEvent>>;
  override completionWithRetry(
    request: OpenAIClient.Responses.ResponseCreateParamsNonStreaming,
    requestOptions?: OpenAIClient.RequestOptions,
  ): Promise<OpenAIClient.Responses.Response>;
  override completionWithRetry(
    request: OpenAIClient.Responses.ResponseCreateParamsStreaming | OpenAIClient.Responses.ResponseCreateParamsNonStreaming,
    requestOptions?: OpenAIClient.RequestOptions,
  ): Promise<AsyncIterable<OpenAIClient.Responses.ResponseStreamEvent> | OpenAIClient.Responses.Response> {
    const input = typeof request.input === 'string' ? [{ content: request.input }] : ((request.input ?? []) as { content?: unknown }[]);
    this.guard.screen([...input, { content: request.instructions ?? '' }]);
    const instructions = [this.guard.systemLine, request.instructions].filter(Boolean).join('\n\n');
    return super.completionWithRetry({ ...request, instructions } as OpenAIClient.Responses.ResponseCreateParamsNonStreaming, requestOptions);
  }
}

/** A `ChatOpenAI` whose `completions` delegate recovers the CLI gateway's `gateway` object on a streamed call — see `GatewayTappingCompletions`. */
export class GatewayChatOpenAI extends ChatOpenAI {
  constructor(fields?: ChatOpenAIFields, guard?: RequestGuard) {
    super({ ...fields, completions: new GatewayTappingCompletions(fields, guard), ...(guard ? { responses: new GuardedResponses(fields, guard) } : {}) });
  }
}
