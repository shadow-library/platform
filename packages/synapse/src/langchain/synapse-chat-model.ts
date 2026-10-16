import { ChatOpenAI, type ChatOpenAIFields, type ChatOpenAIResponses } from '@langchain/openai';

import { type SynapseEnvelope } from '../synapse.types';
import { type SynapseClient } from '../synapse.client';
import { SynapseCompletions, type SynapseRequestHook } from './synapse-completions';

export type SynapseChatModelFields = Omit<
  ChatOpenAIFields,
  'model' | 'modelName' | 'apiKey' | 'openAIApiKey' | 'configuration' | 'maxRetries' | 'completions' | 'responses' | 'useResponsesApi'
> & {
  client: SynapseClient;
  task: string;
  /** Every request, retries of a refused connection aside, gets its own fresh `request_id` */
  envelope: Omit<SynapseEnvelope, 'request_id'>;
  /** Runs before every HTTP request, the `bindTools` and `withConfig` copies' included; a throw propagates as thrown and nothing is sent */
  requestHook?: SynapseRequestHook;
};

/** The SDK refuses to start without a key and would otherwise read `OPENAI_API_KEY`; the client's fetch replaces it with a fresh M2M token per request */
const SDK_API_KEY_PLACEHOLDER = 'synapse-m2m';

/**
 * A `ChatOpenAI` that talks to Synapse: the task is the model, tokens come from the client per request, retries are the client's single
 * connection retry, and the response's `synapse` block lands on `response_metadata.synapse` (and `generationInfo.synapse`) for invoke and stream.
 * Synapse speaks Chat Completions only, so the Responses delegate ChatOpenAI switches to for some tools and options is the same completions one.
 */
export class SynapseChatModel extends ChatOpenAI {
  constructor({ client, task, envelope, requestHook, ...fields }: SynapseChatModelFields) {
    const synapseFields: ChatOpenAIFields = {
      ...fields,
      model: task,
      apiKey: SDK_API_KEY_PLACEHOLDER,
      maxRetries: 0,
      configuration: { baseURL: client.baseUrl, fetch: client.fetch },
      modelKwargs: { ...fields.modelKwargs, synapse: envelope },
    };
    const completions = new SynapseCompletions(synapseFields, requestHook);
    super({ ...synapseFields, completions, responses: completions as unknown as ChatOpenAIResponses });
  }
}
