import { Field, type FieldSchema, Integer, Schema } from '@shadow-library/class-schema';
import { Sensitive } from '@shadow-library/fastify';
import { type SynapseEffort, type SynapseEnvelope, type SynapseSubject, type SynapseSubjectType } from '@shadow-library/synapse';

import { EFFORTS } from '@modules/catalog';
import { type ChatMessage, type ChatRequestBody, type EmbeddingRequestBody, type ImageRequestBody, type JsonObject, type ResponseFormat } from '@modules/providers';

const SUBJECT_TYPES: SynapseSubjectType[] = ['owner', 'user', 'app'];
const MAX_EMBEDDING_INPUTS = 2048;
const MAX_SELECTORS = 32;

/** class-schema cannot declare a primitive-or-array union, so the reflected `object` type is cleared and the `anyOf` alone decides */
const STRING_OR_STRINGS = {
  type: undefined,
  anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MAX_EMBEDDING_INPUTS }],
  description: 'A string, or a list of strings',
} as unknown as FieldSchema;

/** An OpenAI member Synapse passes through without reading its shape */
@Schema({ additionalProperties: true })
export class JsonObjectBody {}

@Schema({ additionalProperties: String, maxProperties: MAX_SELECTORS })
export class SelectorsBody {}

@Schema()
export class SubjectBody implements SynapseSubject {
  @Field(() => String, { enum: SUBJECT_TYPES })
  type: SynapseSubjectType;

  @Field({ minLength: 1, maxLength: 128 })
  id: string;
}

@Schema()
export class SynapseEnvelopeBody implements SynapseEnvelope {
  @Field({ minLength: 1, maxLength: 64, pattern: '^[!-~]+$', description: 'Caller generated and unique across every call: a reused id is refused with SYN_DUPLICATE_REQUEST' })
  request_id: string;

  @Field(() => SubjectBody, { description: 'Whom the call is made for; per-subject budgets count against it' })
  subject: SubjectBody;

  @Field(() => SelectorsBody, { optional: true, description: "Values the task's routes and alias availability match on" })
  selectors?: Record<string, string>;

  @Field(() => [String], {
    optional: true,
    maxItems: MAX_SELECTORS,
    uniqueItems: true,
    description:
      'Selector keys, each also in `selectors`, that the chosen route must carry with the requested value; a call that would fall to a route without every one is refused with SYN_NO_ELIGIBLE_MODEL',
  })
  strict?: string[];

  @Field({
    optional: true,
    minLength: 1,
    maxLength: 64,
    description: "An alias the task accepts; a retired one falls back to the task's routes, and so does one whose `available` rule does not name every `strict` value",
  })
  alias?: string;

  @Field(() => String, { optional: true, enum: [...EFFORTS], description: "Clamped to the task's range, then sent only where the model supports it" })
  effort?: SynapseEffort;

  @Field({ optional: true, minLength: 1, maxLength: 256, description: 'Continues a provider-side conversation where the provider keeps sessions; ignored elsewhere' })
  session?: string;

  @Field({ optional: true })
  web_search?: boolean;
}

/**
 * Unknown members, `tool_choice` and `stop` among them, pass through to the provider; the dialect members Synapse owns are dropped.
 * Content members are `@Sensitive`, so the request log never carries prompt text.
 */
@Schema({ additionalProperties: true })
export class ChatCompletionBody implements ChatRequestBody {
  @Field({ minLength: 1, maxLength: 128, description: 'The task id, `<app>.<name>`' })
  model: string;

  @Field(() => [JsonObjectBody], { minItems: 1 })
  @Sensitive()
  messages: ChatMessage[];

  @Field(() => [JsonObjectBody], { optional: true })
  tools?: unknown[];

  @Field({ optional: true })
  stream?: boolean;

  @Field(() => JsonObjectBody, { optional: true })
  stream_options?: JsonObject;

  @Field(() => JsonObjectBody, { optional: true })
  response_format?: ResponseFormat;

  @Field({ optional: true })
  temperature?: number;

  @Field({ optional: true })
  top_p?: number;

  @Field(() => Integer, { optional: true, minimum: 1 })
  max_tokens?: number;

  @Field(() => Integer, { optional: true, minimum: 1 })
  max_completion_tokens?: number;

  @Field(() => Integer, { optional: true })
  seed?: number;

  @Field(() => SynapseEnvelopeBody)
  synapse: SynapseEnvelopeBody;
}

@Schema({ additionalProperties: true })
export class EmbeddingsBody implements EmbeddingRequestBody {
  @Field({ minLength: 1, maxLength: 128, description: 'The task id, `<app>.<name>`' })
  model: string;

  @Field(STRING_OR_STRINGS)
  @Sensitive()
  input: string | string[];

  @Field(() => SynapseEnvelopeBody)
  synapse: SynapseEnvelopeBody;
}

@Schema()
export class ImageGenerationBody implements ImageRequestBody {
  @Field({ minLength: 1, maxLength: 128, description: 'The task id, `<app>.<name>`' })
  model: string;

  @Field({ minLength: 1 })
  @Sensitive()
  prompt: string;

  @Field(() => Integer, { optional: true, minimum: 1, maximum: 10 })
  n?: number;

  @Field(() => [String], { optional: true, maxItems: 16, description: 'Data URLs or https URLs of images to work from' })
  @Sensitive()
  reference_images?: string[];

  @Field(() => SynapseEnvelopeBody)
  synapse: SynapseEnvelopeBody;
}

@Schema()
export class SynapseCostResponse {
  @Field({ description: 'At catalog list price, whoever served the call; budgets count this' })
  list_usd: number;

  @Field({ description: 'What the provider charges: zero on a subscription or local deployment' })
  billed_usd: number;
}

@Schema()
export class SynapseBlockResponse {
  @Field()
  request_id: string;

  @Field()
  task: string;

  @Field(() => String, { nullable: true })
  alias: string | null;

  @Field()
  label: string;

  @Field()
  model: string;

  @Field()
  provider: string;

  @Field(() => String, { nullable: true, description: 'The effort sent to the model, or null when no reasoning control was sent' })
  effort: SynapseEffort | null;

  @Field(() => Integer, { description: 'Deployments tried, including the one that answered' })
  attempts: number;

  @Field(() => Integer)
  catalog_version: number;

  @Field(() => SynapseCostResponse)
  cost: SynapseCostResponse;

  @Field({ optional: true, description: 'Present when web search was requested: whether the serving deployment ran it' })
  web_search?: boolean;

  @Field(() => Integer, { optional: true, description: 'Embeddings only' })
  dimensions?: number;
}

@Schema()
export class PromptTokensDetails {
  @Field(() => Integer)
  cached_tokens: number;
}

@Schema()
export class CompletionTokensDetails {
  @Field(() => Integer)
  reasoning_tokens: number;
}

@Schema()
export class ChatUsageResponse {
  @Field(() => Integer)
  prompt_tokens: number;

  @Field(() => Integer)
  completion_tokens: number;

  @Field(() => Integer)
  total_tokens: number;

  @Field(() => PromptTokensDetails)
  prompt_tokens_details: PromptTokensDetails;

  @Field(() => CompletionTokensDetails)
  completion_tokens_details: CompletionTokensDetails;
}

/** The provider's completion with `model` set to the task id; members Synapse does not know are kept */
@Schema({ additionalProperties: true })
export class ChatCompletionResponse {
  @Field({ optional: true })
  id?: string;

  @Field({ optional: true })
  object?: string;

  @Field(() => Integer, { optional: true })
  created?: number;

  @Field()
  model: string;

  @Field(() => [JsonObjectBody])
  choices: JsonObject[];

  @Field(() => ChatUsageResponse, { optional: true })
  usage?: ChatUsageResponse;

  @Field(() => SynapseBlockResponse)
  synapse: SynapseBlockResponse;
}

@Schema()
export class EmbeddingUsageResponse {
  @Field(() => Integer)
  prompt_tokens: number;

  @Field(() => Integer)
  total_tokens: number;
}

@Schema({ additionalProperties: true })
export class EmbeddingsResponse {
  @Field({ optional: true })
  object?: string;

  @Field(() => [JsonObjectBody])
  data: JsonObject[];

  @Field()
  model: string;

  @Field(() => EmbeddingUsageResponse, { optional: true })
  usage?: EmbeddingUsageResponse;

  @Field(() => SynapseBlockResponse)
  synapse: SynapseBlockResponse;
}

@Schema()
export class GeneratedImageResponse {
  @Field()
  b64_json: string;

  @Field()
  media_type: string;
}

@Schema()
export class ImageUsageResponse {
  @Field({ optional: true, description: 'What the call was billed, in USD' })
  cost?: number;
}

@Schema()
export class ImageGenerationResponse {
  @Field(() => [GeneratedImageResponse])
  data: GeneratedImageResponse[];

  @Field(() => ImageUsageResponse)
  usage: ImageUsageResponse;

  @Field(() => SynapseBlockResponse)
  synapse: SynapseBlockResponse;
}

@Schema()
export class SynapseErrorDetail {
  @Field()
  message: string;

  @Field(() => String, { enum: ['invalid_request_error', 'authentication_error', 'rate_limit_error', 'server_error'] })
  type: string;

  @Field({ description: 'A `SYN_*` code, or the auth guard or request validation code on the same route' })
  code: string;

  @Field({ optional: true, description: 'The request member at fault' })
  param?: string;
}

@Schema()
export class SynapseErrorResponse {
  @Field(() => SynapseErrorDetail)
  error: SynapseErrorDetail;
}
