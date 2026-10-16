import { type ModelPrice } from './catalog.types';

export interface TokenTotals {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

const PER_MILLION = 1_000_000;

export function roundUsd(value: number): number {
  return Math.round(value * PER_MILLION) / PER_MILLION;
}

/** `outputTokens` includes reasoning tokens (OpenAI `completion_tokens` semantics) and `inputTokens` includes cached ones; image output is not derivable from tokens. */
export function listCostUsd(price: ModelPrice, tokens: TokenTotals): number {
  const cached = Math.min(tokens.cachedInputTokens, tokens.inputTokens);
  const cost = (tokens.inputTokens - cached) * price.input + cached * (price.cachedInput ?? price.input) + tokens.outputTokens * price.output;
  return roundUsd(cost / PER_MILLION);
}
