export type AiRole =
  | 'extraction'
  | 'generation'
  | 'judge'
  | 'fix'
  | 'rebrand'
  | 'reforge'
  | 'outline'
  | 'revision'
  | 'title'
  | 'continuity'
  | 'epitome'
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

export type ModelGroup = 'writing' | 'planning' | 'review' | 'chat' | 'helper' | 'image' | 'embedding';

// Every fine-grained role maps to exactly one user-facing model group. Roles stay fine-grained
// internally (prompts + telemetry + routing); the group is only the unit the author selects a model
// for. `chat` is its own group but, when unset, follows the planning selection (see resolveModel).
export const ROLE_GROUP: Record<AiRole, ModelGroup> = {
  generation: 'writing',
  revision: 'writing',
  fix: 'writing',
  rebrand: 'writing',
  reforge: 'writing',
  premise: 'planning',
  plan: 'planning',
  arc: 'planning',
  outline: 'planning',
  skeleton: 'planning',
  bible: 'planning',
  extraction: 'planning',
  judge: 'review',
  validation: 'review',
  continuity: 'review',
  review: 'review',
  audit: 'review',
  chat: 'chat',
  title: 'helper',
  compact: 'helper',
  epitome: 'helper',
  image: 'image',
  embedding: 'embedding',
};

// Group-level defaults are the single source of truth; the per-role maps below derive from them so the
// router (which resolves per role) and the settings UI (which picks per group) never drift. `chat`
// mirrors `planning`. Production routes every hosted role through OpenRouter, including image
// generation (writing/planning/review/chat → x-ai/grok-4.6, helper → openai/gpt-5.6-luna, image →
// x-ai/grok-imagine-image-2.0) — IllustrationService picks its own model per project rather than
// calling `resolveModel('image', ...)`, so this entry is informational (settings UI) only.
const PRODUCTION_GROUP_DEFAULTS: Record<ModelGroup, ResolvedModel> = {
  writing: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
  planning: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
  review: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
  chat: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
  helper: { provider: 'openrouter', model: 'openai/gpt-5.6-luna' },
  image: { provider: 'openrouter', model: 'x-ai/grok-imagine-image-2.0' },
  embedding: { provider: 'ollama', model: 'qwen3-embedding:8b' },
};

// Local-test profile: routes everything to Ollama (used in smoke tests / dev without API keys).
const LOCAL_TEST_GROUP_DEFAULTS: Record<ModelGroup, ResolvedModel> = {
  writing: { provider: 'ollama', model: 'qwen3:14b' },
  planning: { provider: 'ollama', model: 'qwen3:14b' },
  // review needs the 14b model: qwen3:8b fixes one audit gap per round and oscillates on taste
  // instead of settling at `keep`, so judge loops never converge on the smaller model.
  review: { provider: 'ollama', model: 'qwen3:14b' },
  chat: { provider: 'ollama', model: 'qwen3:14b' },
  helper: { provider: 'ollama', model: 'qwen3:8b' },
  image: { provider: 'ollama', model: 'qwen3:8b' },
  embedding: { provider: 'ollama', model: 'qwen3-embedding:8b' },
};

function deriveRoleDefaults(groups: Record<ModelGroup, ResolvedModel>): Record<AiRole, ResolvedModel> {
  const entries = (Object.keys(ROLE_GROUP) as AiRole[]).map(role => [role, groups[ROLE_GROUP[role]]] as const);
  return Object.fromEntries(entries) as Record<AiRole, ResolvedModel>;
}

export const PRODUCTION_DEFAULTS: Record<AiRole, ResolvedModel> = deriveRoleDefaults(PRODUCTION_GROUP_DEFAULTS);
export const LOCAL_TEST_DEFAULTS: Record<AiRole, ResolvedModel> = deriveRoleDefaults(LOCAL_TEST_GROUP_DEFAULTS);

// Read directly from process.env so smoke scripts can override it at runtime
// without needing to re-bootstrap Config (which caches at load time).
export function getProfileDefaults(): Record<AiRole, ResolvedModel> {
  const profile = process.env['AI_PROFILE'] ?? 'production';
  if (profile === 'local-test') return LOCAL_TEST_DEFAULTS;
  return PRODUCTION_DEFAULTS;
}

// The group-level defaults for the active profile — what the settings UI shows as each group's inherited model.
export function getGroupDefaults(): Record<ModelGroup, ResolvedModel> {
  const profile = process.env['AI_PROFILE'] ?? 'production';
  if (profile === 'local-test') return LOCAL_TEST_GROUP_DEFAULTS;
  return PRODUCTION_GROUP_DEFAULTS;
}
