import { type SynapseResponseBlock } from '@shadow-library/synapse';

export const SYNAPSE_BLOCK: SynapseResponseBlock = {
  request_id: 'echoed-by-synapse',
  task: 'novel-forge.chat',
  alias: 'opus',
  label: 'Opus',
  model: 'claude-opus-5.5',
  provider: 'subscription',
  effort: 'low',
  attempts: 1,
  catalog_version: 12,
  cost: { list_usd: 0.0213, billed_usd: 0 },
};

export const USAGE = { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15, prompt_tokens_details: { cached_tokens: 4 }, completion_tokens_details: { reasoning_tokens: 0 } };

export const CHAT_COMPLETION = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 1_760_000_000,
  model: 'novel-forge.chat',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hello world', refusal: null }, finish_reason: 'stop', logprobs: null }],
  usage: USAGE,
  synapse: SYNAPSE_BLOCK,
};

const chunk = (delta: Record<string, unknown>, finishReason: string | null = null): Record<string, unknown> => ({
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  created: 1_760_000_000,
  model: 'novel-forge.chat',
  choices: [{ index: 0, delta, finish_reason: finishReason, logprobs: null }],
});

export const STREAM_CHUNKS = [chunk({ role: 'assistant', content: 'Hello' }), chunk({ content: ' world' }), chunk({}, 'stop')];

export const RESET_FRAME = {
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  created: 1_760_000_000,
  model: 'novel-forge.chat',
  choices: [],
  synapse_event: { type: 'reset', reason: 'web_search' },
};

export const SEARCH_PREAMBLE = chunk({ role: 'assistant', content: 'Let me look that up.' });

export const FINAL_FRAME = {
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  created: 1_760_000_000,
  model: 'novel-forge.chat',
  choices: [],
  usage: USAGE,
  synapse: SYNAPSE_BLOCK,
};
