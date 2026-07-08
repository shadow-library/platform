/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type AiRole =
  | 'extraction'
  | 'generation'
  | 'judge'
  | 'fix'
  | 'outline'
  | 'revision'
  | 'title'
  | 'continuity'
  | 'validation'
  | 'review'
  | 'plan'
  | 'skeleton'
  | 'bible'
  | 'premise'
  | 'audit'
  | 'chat'
  | 'compact'
  | 'arc'
  | 'embedding'
  | 'image';

export interface ResolvedModel {
  provider: string;
  model: string;
}

export interface AiProfile {
  roleOverrides?: Partial<Record<AiRole, ResolvedModel>>;
  forceProvider?: string;
}

/**
 * Declaring the constants
 */

// Production defaults: all analytical + authoring roles default to grok-3; image to grok-2-image.
export const PRODUCTION_DEFAULTS: Record<AiRole, ResolvedModel> = {
  extraction: { provider: 'xai', model: 'grok-3' },
  generation: { provider: 'xai', model: 'grok-3' },
  judge: { provider: 'xai', model: 'grok-3' },
  fix: { provider: 'xai', model: 'grok-3' },
  outline: { provider: 'xai', model: 'grok-3' },
  revision: { provider: 'xai', model: 'grok-3' },
  title: { provider: 'xai', model: 'grok-3-mini' },
  continuity: { provider: 'xai', model: 'grok-3' },
  validation: { provider: 'xai', model: 'grok-3' },
  review: { provider: 'xai', model: 'grok-3' },
  plan: { provider: 'xai', model: 'grok-3' },
  skeleton: { provider: 'xai', model: 'grok-3' },
  bible: { provider: 'xai', model: 'grok-3' },
  premise: { provider: 'xai', model: 'grok-3' },
  audit: { provider: 'xai', model: 'grok-3' },
  chat: { provider: 'xai', model: 'grok-3' },
  compact: { provider: 'xai', model: 'grok-3-mini' },
  arc: { provider: 'xai', model: 'grok-3' },
  embedding: { provider: 'ollama', model: 'qwen3-embedding:8b' },
  image: { provider: 'xai', model: 'grok-2-image' },
};

// Local-test profile: routes everything to Ollama (used in smoke tests / dev without API keys).
export const LOCAL_TEST_DEFAULTS: Record<AiRole, ResolvedModel> = {
  extraction: { provider: 'ollama', model: 'qwen3:14b' },
  generation: { provider: 'ollama', model: 'qwen3:14b' },
  judge: { provider: 'ollama', model: 'qwen3:8b' },
  fix: { provider: 'ollama', model: 'qwen3:14b' },
  outline: { provider: 'ollama', model: 'qwen3:8b' },
  revision: { provider: 'ollama', model: 'qwen3:14b' },
  title: { provider: 'ollama', model: 'qwen3:8b' },
  continuity: { provider: 'ollama', model: 'qwen3:8b' },
  validation: { provider: 'ollama', model: 'qwen3:8b' },
  review: { provider: 'ollama', model: 'qwen3:8b' },
  plan: { provider: 'ollama', model: 'qwen3:8b' },
  skeleton: { provider: 'ollama', model: 'qwen3:14b' },
  bible: { provider: 'ollama', model: 'qwen3:14b' },
  premise: { provider: 'ollama', model: 'qwen3:14b' },
  audit: { provider: 'ollama', model: 'qwen3:8b' },
  chat: { provider: 'ollama', model: 'qwen3:14b' },
  compact: { provider: 'ollama', model: 'qwen3:8b' },
  arc: { provider: 'ollama', model: 'qwen3:14b' },
  embedding: { provider: 'ollama', model: 'qwen3-embedding:8b' },
  image: { provider: 'ollama', model: 'qwen3:8b' },
};

// Read directly from process.env so smoke scripts can override it at runtime
// without needing to re-bootstrap Config (which caches at load time).
export function getProfileDefaults(): Record<AiRole, ResolvedModel> {
  const profile = process.env['AI_PROFILE'] ?? 'production';
  if (profile === 'local-test') return LOCAL_TEST_DEFAULTS;
  return PRODUCTION_DEFAULTS;
}
