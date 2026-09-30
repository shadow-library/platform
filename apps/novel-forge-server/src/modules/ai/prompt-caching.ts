import { type BaseMessage, mapStoredMessageToChatMessage } from '@langchain/core/messages';

import { countTokens } from './context/token-budget';

// Anthropic ignores cache_control on blocks below its minimum cacheable size, so marking smaller
// blocks would only burn one of the four allowed breakpoints.
export const MIN_CACHEABLE_TOKENS = 1024;

function markEphemeral(message: BaseMessage): BaseMessage {
  if (typeof message.content !== 'string') return message;
  if (countTokens(message.content) < MIN_CACHEABLE_TOKENS) return message;
  const marked = mapStoredMessageToChatMessage(message.toDict());
  marked.content = [{ type: 'text', text: message.content, cache_control: { type: 'ephemeral' } }] as never;
  return marked;
}

/**
 * Injects Anthropic prompt-cache breakpoints per the stable-first message convention: the static system message, the first human message
 * (the stable scope context), and — for chat — the last prior-turn history message, so the cached prefix extends across turns.
 * Three breakpoints maximum, within Anthropic's limit of four. Marked messages are copies: formatMessages passes a template's own message
 * instances through uncopied, so marking one in place would leak the breakpoint into every later call on that template, whatever its model.
 */
export function applyAnthropicCacheControl(messages: BaseMessage[]): BaseMessage[] {
  const breakpoints = new Set([messages.findIndex(m => m.getType() === 'system'), messages.findIndex(m => m.getType() === 'human'), messages.length - 2]);
  return messages.map((message, index) => (breakpoints.has(index) ? markEphemeral(message) : message));
}
