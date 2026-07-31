/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type BaseMessage } from '@langchain/core/messages';

/**
 * Importing user defined packages
 */
import { countTokens } from './context/token-budget';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// Anthropic ignores cache_control on blocks below its minimum cacheable size, so marking smaller
// blocks would only burn one of the four allowed breakpoints.
export const MIN_CACHEABLE_TOKENS = 1024;

function markEphemeral(message: BaseMessage | undefined): void {
  if (!message || typeof message.content !== 'string') return;
  if (countTokens(message.content) < MIN_CACHEABLE_TOKENS) return;
  message.content = [{ type: 'text', text: message.content, cache_control: { type: 'ephemeral' } }] as never;
}

/**
 * Injects Anthropic prompt-cache breakpoints per the stable-first message convention (refinement
 * design §10.2): the static system message, the first human message (the stable scope context), and
 * — for chat — the last prior-turn history message, so the cached prefix extends across turns.
 * Mutates the freshly formatted messages in place and returns them; three breakpoints maximum,
 * within Anthropic's limit of four.
 */
export function applyAnthropicCacheControl(messages: BaseMessage[]): BaseMessage[] {
  const system = messages.find(m => m.getType() === 'system');
  const firstHuman = messages.find(m => m.getType() === 'human');
  markEphemeral(system);
  markEphemeral(firstHuman);

  const beforeVolatileTail = messages[messages.length - 2];
  if (beforeVolatileTail && beforeVolatileTail !== system && beforeVolatileTail !== firstHuman) markEphemeral(beforeVolatileTail);

  return messages;
}
