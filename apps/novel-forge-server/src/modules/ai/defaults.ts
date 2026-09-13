import { MODEL_MAP, type ReasoningEffort } from './models';

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
  | 'illustration'
  | 'image'
  | 'vision'
  | 'ideation';

export interface ResolvedModel {
  provider: string;
  model: string;
}

export type ModelGroup = 'writing' | 'planning' | 'review' | 'chat' | 'helper' | 'image' | 'vision' | 'embedding' | 'ideation';

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
  // Composing an image prompt from canon is short mechanical structuring, not authoring or review.
  illustration: 'helper',
  image: 'image',
  // Not author-selectable: account and project picks for a text-only group must never strip image input from a caller that needs it.
  vision: 'vision',
  embedding: 'embedding',
  ideation: 'ideation',
};

// Group-level defaults are the single source of truth; the per-role maps below derive from them so the
// router (which resolves per role) and the settings UI (which picks per group) never drift. `chat`
// mirrors `planning`. Production routes every hosted role through OpenRouter, per group, based on the
// completed model evaluation: writing → moonshotai/kimi-k3 (top-2 measured long-form prose, near-zero
// longform degradation), planning/chat → z-ai/glm-5.2 (strong structured output + instruction
// following), review → anthropic/claude-sonnet-5 (best tool-calling reliability for the judge loop),
// helper → openai/gpt-5.6-luna, image → x-ai/grok-imagine-image-2.0 (IllustrationService resolves it
// through `resolveModel('image', project)`, so a project-level override is honoured), ideation →
// anthropic/claude-opus-5 (the ideation studio has no settings screen, so this is the studio's fixed
// default rather than a group an author configures), vision → openai/gpt-5.6-luna (the cheapest registered model OpenRouter lists
// with image input; like ideation it is a fixed default, not an author-configured group).
const PRODUCTION_GROUP_DEFAULTS: Record<ModelGroup, ResolvedModel> = {
  writing: { provider: 'openrouter', model: 'moonshotai/kimi-k3' },
  planning: { provider: 'openrouter', model: 'z-ai/glm-5.2' },
  review: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' },
  chat: { provider: 'openrouter', model: 'z-ai/glm-5.2' },
  helper: { provider: 'openrouter', model: 'openai/gpt-5.6-luna' },
  image: { provider: 'openrouter', model: 'x-ai/grok-imagine-image-2.0' },
  vision: { provider: 'openrouter', model: 'openai/gpt-5.6-luna' },
  embedding: { provider: 'ollama', model: 'qwen3-embedding:8b' },
  ideation: { provider: 'openrouter', model: 'anthropic/claude-opus-5' },
};

// Unrestricted is an alternate model map, not a vendor pin. Writing goes to Grok 4.6; planning/chat stay on
// GLM-5.2 (same structured stack as Standard); review/helper move off Claude/Luna onto DeepSeek V4 Pro.
// Opus is not on `UNRESTRICTED_LLM_ALLOWLIST`, so ideation falls back to GLM-5.2 there too. Vision takes Grok 4.6: DeepSeek and GLM
// accept no image input, and it is the cheaper of the two allowlisted models that do.
export const UNRESTRICTED_GROUP_DEFAULTS: Record<ModelGroup, ResolvedModel> = {
  writing: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
  planning: { provider: 'openrouter', model: 'z-ai/glm-5.2' },
  review: { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
  chat: { provider: 'openrouter', model: 'z-ai/glm-5.2' },
  helper: { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
  image: { provider: 'openrouter', model: 'x-ai/grok-imagine-image-2.0' },
  vision: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
  embedding: { provider: 'ollama', model: 'qwen3-embedding:8b' },
  ideation: { provider: 'openrouter', model: 'z-ai/glm-5.2' },
};

export const UNRESTRICTED_DEFAULTS: Record<AiRole, ResolvedModel> = deriveRoleDefaults(UNRESTRICTED_GROUP_DEFAULTS);

// Overrides on an Unrestricted project are honoured only when the model is on the unrestricted allowlist.
// grok-4.3 is excluded: it refuses the unrestricted writing brief and collapses into summary-like prose.
export const UNRESTRICTED_LLM_ALLOWLIST = ['x-ai/grok-4.6', 'deepseek/deepseek-v4-pro', 'z-ai/glm-5.2', 'moonshotai/kimi-k3'] as const;
export const UNRESTRICTED_IMAGE_ALLOWLIST = ['x-ai/grok-imagine-image-2.0'] as const;

export function isUnrestrictedAllowed(role: AiRole, resolved: ResolvedModel): boolean {
  if (role === 'embedding') return true;
  if (role === 'image') return (UNRESTRICTED_IMAGE_ALLOWLIST as readonly string[]).includes(resolved.model);
  return (UNRESTRICTED_LLM_ALLOWLIST as readonly string[]).includes(resolved.model);
}

// Write-time allowlist gate: a pick is accepted only when the model id is in the registry AND the
// stated provider matches the registry's — a real model id paired with the wrong provider is rejected.
export function isRegisteredModel(resolved: ResolvedModel): boolean {
  return MODEL_MAP[resolved.model]?.provider === resolved.provider;
}

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
  // No registered local model accepts images, so vision calls fail with AI_011 under this profile.
  vision: { provider: 'ollama', model: 'qwen3:8b' },
  embedding: { provider: 'ollama', model: 'qwen3-embedding:8b' },
  ideation: { provider: 'ollama', model: 'qwen3:14b' },
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

// How hard each group is allowed to think. Hidden reasoning tokens bill as output, so the mechanical
// helper roles (title, compact, epitome) ask for none at all; every authoring group buys the cheapest
// tier its model offers rather than the provider default, which is typically medium or high.
export const REASONING_POLICY: Record<ModelGroup, ReasoningEffort> = {
  writing: 'low',
  planning: 'low',
  review: 'low',
  chat: 'low',
  helper: 'none',
  image: 'none',
  vision: 'none',
  embedding: 'none',
  ideation: 'low',
};

// Returns the effort to send, or undefined to omit the reasoning field entirely — which is itself how
// an `optional` model is told not to reason. A `mandatory` model cannot be silenced, so a policy its
// registry entry does not list clamps to the lowest tier it does.
export function resolveReasoningEffort(model: string, group: ModelGroup): ReasoningEffort | undefined {
  const reasoning = MODEL_MAP[model]?.reasoning;
  if (!reasoning || reasoning.mode === 'none') return undefined;
  const policy = REASONING_POLICY[group];
  const efforts = reasoning.efforts;
  if (efforts?.includes(policy)) return policy;
  if (reasoning.mode === 'optional') return undefined;
  return efforts?.at(-1);
}
