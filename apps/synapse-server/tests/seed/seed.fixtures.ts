import { utils } from '@shadow-library/common';

import { type SeedProviderUrls } from '@server/database/seed';

export const SEED_URLS = Object.freeze<SeedProviderUrls>({
  subscription: 'http://subscription.test/v1',
  openrouter: 'https://openrouter.test/api/v1',
  local: 'http://local.test:11434',
});

export const LEGACY_ALIAS_KEYS = Object.freeze(['opus', 'sonnet', 'haiku', 'grok', 'gpt-sol', 'gpt-luna', 'gpt', 'gpt-mini', 'kimi', 'glm', 'deepseek', 'gemini-flash']);

export const UNRESTRICTED_SLUGS = Object.freeze(['x-ai/grok-4.6', 'deepseek/deepseek-v4-pro', 'z-ai/glm-5.2', 'moonshotai/kimi-k3']);

export const EXPECTED_MODEL_KEYS = Object.freeze([
  'grok-4.6',
  'grok-4.3',
  'grok-imagine-image-2.0',
  'claude-sonnet-5',
  'claude-opus-5.5',
  'claude-opus-5',
  'claude-haiku-4.5',
  'gpt-5.4',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.4-mini',
  'gpt-5.4-image-2',
  'kimi-k3',
  'kimi-k2.6',
  'glm-5.2',
  'glm-5.3',
  'deepseek-v4-pro',
  'gemini-3.7-flash',
  'qwen3-embedding:0.6b',
  'llama3.1',
]);

export const EXPECTED_MODELS = utils.object.deepFreeze({
  economy: {
    standard: {
      writing: 'claude-haiku-4.5',
      planning: 'claude-sonnet-5',
      review: 'claude-haiku-4.5',
      chat: 'claude-sonnet-5',
      helper: 'gpt-5.6-luna',
      image: 'grok-imagine-image-2.0',
      vision: 'gpt-5.6-luna',
      embedding: 'qwen3-embedding:0.6b',
    },
    unrestricted: {
      writing: 'deepseek-v4-pro',
      planning: 'deepseek-v4-pro',
      review: 'deepseek-v4-pro',
      chat: 'deepseek-v4-pro',
      helper: 'deepseek-v4-pro',
      image: 'grok-imagine-image-2.0',
      vision: 'grok-4.6',
      embedding: 'qwen3-embedding:0.6b',
    },
  },
  balanced: {
    standard: {
      writing: 'claude-sonnet-5',
      planning: 'claude-opus-5.5',
      review: 'claude-sonnet-5',
      chat: 'claude-opus-5.5',
      helper: 'gpt-5.6-luna',
      image: 'grok-imagine-image-2.0',
      vision: 'gpt-5.6-luna',
      embedding: 'qwen3-embedding:0.6b',
    },
    unrestricted: {
      writing: 'grok-4.6',
      planning: 'glm-5.2',
      review: 'deepseek-v4-pro',
      chat: 'glm-5.2',
      helper: 'deepseek-v4-pro',
      image: 'grok-imagine-image-2.0',
      vision: 'grok-4.6',
      embedding: 'qwen3-embedding:0.6b',
    },
  },
  performant: {
    standard: {
      writing: 'claude-opus-5.5',
      planning: 'claude-opus-5.5',
      review: 'claude-opus-5.5',
      chat: 'claude-opus-5.5',
      helper: 'claude-haiku-4.5',
      image: 'grok-imagine-image-2.0',
      vision: 'gpt-5.6-luna',
      embedding: 'qwen3-embedding:0.6b',
    },
    unrestricted: {
      writing: 'kimi-k3',
      planning: 'kimi-k3',
      review: 'kimi-k3',
      chat: 'kimi-k3',
      helper: 'glm-5.2',
      image: 'grok-imagine-image-2.0',
      vision: 'grok-4.6',
      embedding: 'qwen3-embedding:0.6b',
    },
  },
} as const);

export const EXPECTED_EFFORTS = utils.object.deepFreeze({
  economy: {
    standard: { writing: undefined, planning: 'medium', review: undefined, chat: 'low', helper: 'none', image: undefined, vision: 'none', embedding: undefined },
    unrestricted: { writing: undefined, planning: undefined, review: undefined, chat: undefined, helper: undefined, image: undefined, vision: 'low', embedding: undefined },
  },
  balanced: {
    standard: { writing: 'low', planning: 'medium', review: 'low', chat: 'low', helper: 'none', image: undefined, vision: 'none', embedding: undefined },
    unrestricted: { writing: 'low', planning: undefined, review: undefined, chat: undefined, helper: undefined, image: undefined, vision: 'low', embedding: undefined },
  },
  performant: {
    standard: { writing: 'low', planning: 'medium', review: 'low', chat: 'low', helper: undefined, image: undefined, vision: 'none', embedding: undefined },
    unrestricted: { writing: 'low', planning: undefined, review: 'low', chat: 'low', helper: undefined, image: undefined, vision: 'low', embedding: undefined },
  },
} as const);

export const GATEWAY_ALLOWLIST = Object.freeze([
  'claude-fable-5.1',
  'claude-opus-5.5',
  'claude-opus-5',
  'claude-sonnet-5.5',
  'claude-sonnet-5',
  'claude-haiku-5.5',
  'claude-haiku-4.5',
  'gpt-6.1-sol',
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'grok-4.7',
  'grok-4.6',
  'grok-4.5',
]);
