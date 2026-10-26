import { type CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { type ChatModelStreamEvent } from '@langchain/core/language_models/event';
import { AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import { ChatOpenAICompletions, type ChatOpenAIFields, OpenAIClient, wrapOpenAIClientError } from '@langchain/openai';
import { AppError, ErrorCode } from '@shadow-library/common/errors';

import { STREAM_ERROR_STATUS } from '../constants';
import { parseSynapseError } from '../synapse.error';
import { type SynapseResponseBlock } from '../synapse.types';
import { isRecord } from '../synapse.utils';

type ChatCompletion = OpenAIClient.Chat.Completions.ChatCompletion;
type ChatCompletionChunk = OpenAIClient.Chat.Completions.ChatCompletionChunk;
type StreamingRequest = OpenAIClient.Chat.ChatCompletionCreateParamsStreaming;
type NonStreamingRequest = OpenAIClient.Chat.ChatCompletionCreateParamsNonStreaming;

export type SynapseCompletionRequest = StreamingRequest | NonStreamingRequest;

export type SynapseRequestHook = <T extends SynapseCompletionRequest>(request: T) => T | Promise<T>;

interface SynapseBox {
  synapse?: SynapseResponseBlock;
  resets: number;
}

/** Set on the `response_metadata` of an empty chunk standing for a reset: every content chunk before it is void */
export const SYNAPSE_RESET_METADATA = 'synapse_reset';

export function isSynapseReset(message: { response_metadata?: Record<string, unknown> }): boolean {
  return message.response_metadata?.[SYNAPSE_RESET_METADATA] === true;
}

function resetChunk(): ChatGenerationChunk {
  return new ChatGenerationChunk({ text: '', message: new AIMessageChunk({ content: '', response_metadata: { [SYNAPSE_RESET_METADATA]: true } }) });
}

const SYNAPSE_BOX = Symbol('synapseBox');

function attachBox(options: object): SynapseBox {
  const box: SynapseBox = { resets: 0 };
  (options as Record<symbol, SynapseBox>)[SYNAPSE_BOX] = box;
  return box;
}

const boxOf = (requestOptions: OpenAIClient.RequestOptions | undefined): SynapseBox | undefined => (requestOptions as Record<symbol, SynapseBox> | undefined)?.[SYNAPSE_BOX];

function synapseOf(frame: object): SynapseResponseBlock | undefined {
  const synapse = (frame as { synapse?: unknown }).synapse;
  return isRecord(synapse) ? (synapse as unknown as SynapseResponseBlock) : undefined;
}

function isResetFrame(frame: object): boolean {
  const event = (frame as { synapse_event?: unknown }).synapse_event;
  return isRecord(event) && event['type'] === 'reset';
}

function withFreshRequestId<T extends SynapseCompletionRequest>(request: T): T {
  const synapse = (request as T & { synapse?: object }).synapse;
  return synapse ? { ...request, synapse: { ...synapse, request_id: crypto.randomUUID() } } : request;
}

const unfinished = (): AppError => ErrorCode.API_REQUEST_NETWORK_ERROR.create({ reason: 'the synapse stream ended before its final frame' });

/**
 * The SDK wraps whatever the client's fetch threw (a token refusal, an exhausted connection retry) as a connection error, and
 * `wrapOpenAIClientError` re-wraps a context-length message as a `ContextOverflowError` holding the APIError as its cause.
 */
function toSynapseFailure(error: unknown): unknown {
  const apiError = error instanceof OpenAIClient.APIError ? error : error instanceof Error && error.cause instanceof OpenAIClient.APIError ? error.cause : undefined;
  if (!apiError) return error;
  if (AppError.is(apiError.cause)) return apiError.cause;
  if (apiError instanceof OpenAIClient.APIConnectionError || apiError instanceof OpenAIClient.APIUserAbortError) return error;
  if (apiError.status === undefined && !isRecord(apiError.error)) return error;
  return parseSynapseError(apiError.status ?? STREAM_ERROR_STATUS, { error: apiError.error }, error);
}

async function* tapSynapseFrames(frames: AsyncIterable<ChatCompletionChunk>, box: SynapseBox | undefined): AsyncGenerator<ChatCompletionChunk> {
  try {
    for await (const frame of frames) {
      const synapse = synapseOf(frame);
      if (box && synapse) box.synapse = synapse;
      if (box && isResetFrame(frame)) box.resets++;
      yield frame;
    }
  } catch (error) {
    throw toSynapseFailure(error);
  }
}

function stampSynapse(chunk: ChatGenerationChunk, synapse: SynapseResponseBlock): void {
  chunk.message.response_metadata = { ...chunk.message.response_metadata, synapse };
  chunk.generationInfo = { ...chunk.generationInfo, synapse };
}

/**
 * The delegate `SynapseChatModel` installs through `fields.completions`, the one thing that survives `ChatOpenAI.withConfig()` and `bindTools()`
 * (both rebuild a plain `ChatOpenAI` from the same fields). Synapse's own frame, the one carrying `synapse`, has no `choices`, so
 * @langchain/openai 1.5.5's stream loop (`if (!choice) continue`) drops it. The frames are tapped as they leave `completionWithRetry` into a box
 * stashed on the call's own options object, never on `this`, so concurrent streams through this shared delegate cannot cross-wire.
 */
export class SynapseCompletions extends ChatOpenAICompletions {
  constructor(
    fields: ChatOpenAIFields,
    private readonly requestHook?: SynapseRequestHook,
  ) {
    super(fields);
  }

  override completionWithRetry(request: StreamingRequest, requestOptions?: OpenAIClient.RequestOptions): Promise<AsyncIterable<ChatCompletionChunk>>;
  override completionWithRetry(request: NonStreamingRequest, requestOptions?: OpenAIClient.RequestOptions): Promise<ChatCompletion>;
  override async completionWithRetry(
    request: SynapseCompletionRequest,
    requestOptions?: OpenAIClient.RequestOptions,
  ): Promise<AsyncIterable<ChatCompletionChunk> | ChatCompletion> {
    const fresh = withFreshRequestId(request);
    const body = this.requestHook ? await this.requestHook(fresh) : fresh;
    const options: OpenAIClient.RequestOptions = { ...requestOptions, maxRetries: 0 };
    try {
      if (!body.stream) return body.response_format?.type === 'json_schema' ? await this.createUnparsed(body, options) : await super.completionWithRetry(body, options);
      return tapSynapseFrames(await super.completionWithRetry(body, options), boxOf(requestOptions));
    } catch (error) {
      throw toSynapseFailure(error);
    }
  }

  /**
   * @langchain/openai sends a non-streamed `json_schema` request through the SDK's `parse()`, which throws on a truncated or non-JSON reply and on
   * any non-strict tool. A task whose model takes the schema by prompt answers exactly that way, so `create()` hands the reply to the caller instead.
   */
  private createUnparsed(request: NonStreamingRequest, requestOptions: OpenAIClient.RequestOptions): Promise<ChatCompletion> {
    const clientOptions = this._getClientOptions(requestOptions);
    return this.caller.call(async () => {
      try {
        return await this.client.chat.completions.create(request, clientOptions);
      } catch (error) {
        throw wrapOpenAIClientError(error);
      }
    });
  }

  protected override _convertCompletionsMessageToBaseMessage(message: OpenAIClient.ChatCompletionMessage, rawResponse: ChatCompletion): BaseMessage {
    const converted = super._convertCompletionsMessageToBaseMessage(message, rawResponse);
    const synapse = synapseOf(rawResponse);
    if (synapse) converted.response_metadata = { ...converted.response_metadata, synapse };
    return converted;
  }

  override async _generate(messages: BaseMessage[], options: this['ParsedCallOptions'], runManager?: CallbackManagerForLLMRun): Promise<ChatResult> {
    const result = await super._generate(messages, options, runManager);
    for (const generation of result.generations) {
      const synapse = (generation.message.response_metadata as Record<string, unknown> | undefined)?.synapse;
      if (synapse) generation.generationInfo = { ...generation.generationInfo, synapse };
    }
    return result;
  }

  /**
   * After its loop the base emits exactly one more chunk, the only one carrying `usage_metadata`, built from the same choice-less frame the
   * `synapse` block arrived on; stamping that chunk lands the block once. A stream that reported no usage gets a chunk of its own instead.
   * The base drops a reset frame too, having no choice in it, so a reset is yielded as an empty chunk before whatever the stream sends next.
   */
  override async *_streamResponseChunks(messages: BaseMessage[], options: this['ParsedCallOptions'], runManager?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk> {
    const box = attachBox(options);
    let stamped = false;
    let resets = 0;
    for await (const chunk of super._streamResponseChunks(messages, options, runManager)) {
      for (; resets < box.resets; resets++) yield resetChunk();
      if (box.synapse && (chunk.message as AIMessageChunk).usage_metadata) {
        stampSynapse(chunk, box.synapse);
        stamped = true;
      }
      yield chunk;
    }
    if (options.signal?.aborted) return;
    if (!box.synapse) throw unfinished();
    if (stamped) return;
    const chunk = new ChatGenerationChunk({ text: '', message: new AIMessageChunk({ content: '' }) });
    stampSynapse(chunk, box.synapse);
    yield chunk;
  }

  override async *_streamChatModelEvents(messages: BaseMessage[], options: this['ParsedCallOptions'], runManager?: CallbackManagerForLLMRun): AsyncGenerator<ChatModelStreamEvent> {
    const box = attachBox(options);
    for await (const event of super._streamChatModelEvents(messages, options, runManager)) {
      if (event.event !== 'message-finish' || options.signal?.aborted) yield event;
      else if (!box.synapse) throw unfinished();
      else yield { ...event, responseMetadata: { ...event.responseMetadata, synapse: box.synapse } };
    }
  }
}
