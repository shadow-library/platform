import { type Project } from '@server/database';

import { MODEL_MAP, type ModelEntry, type ReasoningEffort } from './models';

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
  | 'bible'
  | 'premise'
  | 'audit'
  | 'chat'
  | 'compact'
  | 'embedding'
  | 'illustration'
  | 'image'
  | 'vision';

export interface ResolvedModel {
  provider: string;
  model: string;
}

export type ModelGroup = 'writing' | 'planning' | 'review' | 'chat' | 'helper' | 'image' | 'vision' | 'embedding';

// `embedding` is locked to the pgvector dimension and `vision` must stay image-capable, so an author never picks either.
export type SelectableModelGroup = Exclude<ModelGroup, 'vision' | 'embedding'>;

export const SELECTABLE_MODEL_GROUPS: readonly SelectableModelGroup[] = ['writing', 'planning', 'review', 'chat', 'helper', 'image'];

// Every fine-grained role maps to exactly one user-facing model group. Roles stay fine-grained
// internally (prompts + telemetry + routing); the group is only the unit the author selects a model
// for. `chat` is its own group but, when unset, follows the planning selection (see resolveModel).
export const ROLE_GROUP: Record<AiRole, ModelGroup> = {
  generation: 'writing',
  revision: 'writing',
  fix: 'writing',
  premise: 'planning',
  plan: 'planning',
  outline: 'planning',
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
  // Composing an image prompt from canon is short mechanical structuring, not authoring or review.
  illustration: 'helper',
  image: 'image',
  // Not author-selectable: account and project picks for a text-only group must never strip image input from a caller that needs it.
  vision: 'vision',
  embedding: 'embedding',
};

// Group-level defaults are the single source of truth; the per-role maps below derive from them so the
// router (which resolves per role) and the settings UI (which picks per group) never drift. Planning and
// writing follow a cross-judged model comparison: Opus led planning with no outline-parse failures;
// Sonnet was the reliable, low-cost prose pick.
export const PRODUCTION_GROUP_DEFAULTS: Record<ModelGroup, ResolvedModel> = {
  writing: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' },
  planning: { provider: 'openrouter', model: 'anthropic/claude-opus-5.5' },
  review: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' },
  // Its own group, independent of `planning` — resolveModel's project-override fallback is the one place it inherits `plan`.
  chat: { provider: 'openrouter', model: 'anthropic/claude-opus-5.5' },
  helper: { provider: 'openrouter', model: 'openai/gpt-5.6-luna' },
  // IllustrationService resolves through resolveModel('image', project), so a project-level override is honoured.
  image: { provider: 'openrouter', model: 'x-ai/grok-imagine-image-2.0' },
  // Cheapest registered model OpenRouter lists with image input.
  vision: { provider: 'openrouter', model: 'openai/gpt-5.6-luna' },
  embedding: { provider: 'ollama', model: 'qwen3-embedding:0.6b' },
};

// Unrestricted is an alternate model map, not a vendor pin. Writing goes to Grok 4.6; planning/chat stay on
// GLM-5.2 (same structured stack as Standard); review/helper move off Claude/Luna onto DeepSeek V4 Pro.
// Vision takes Grok 4.6: DeepSeek and GLM accept no image input, and it is the cheaper of the two allowlisted models that do.
export const UNRESTRICTED_GROUP_DEFAULTS: Record<ModelGroup, ResolvedModel> = {
  writing: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
  planning: { provider: 'openrouter', model: 'z-ai/glm-5.2' },
  review: { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
  chat: { provider: 'openrouter', model: 'z-ai/glm-5.2' },
  helper: { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
  image: { provider: 'openrouter', model: 'x-ai/grok-imagine-image-2.0' },
  vision: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
  embedding: { provider: 'ollama', model: 'qwen3-embedding:0.6b' },
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

function modelKindFor(role: AiRole): ModelEntry['kind'] {
  if (role === 'image') return 'image';
  if (role === 'embedding') return 'embedding';
  return 'llm';
}

// Write-time allowlist gate: a pick is accepted only when the model id is in the registry, the stated
// provider matches the registry's, and the model's kind is the one the role dispatches to.
export function isRegisteredModel(role: AiRole, resolved: ResolvedModel): boolean {
  const entry = MODEL_MAP[resolved.model];
  return entry?.provider === resolved.provider && entry.kind === modelKindFor(role);
}

function deriveRoleDefaults(groups: Record<ModelGroup, ResolvedModel>): Record<AiRole, ResolvedModel> {
  const entries = (Object.keys(ROLE_GROUP) as AiRole[]).map(role => [role, groups[ROLE_GROUP[role]]] as const);
  return Object.fromEntries(entries) as Record<AiRole, ResolvedModel>;
}

export const PRODUCTION_DEFAULTS: Record<AiRole, ResolvedModel> = deriveRoleDefaults(PRODUCTION_GROUP_DEFAULTS);

export const COST_TIERS: readonly Project.CostTier[] = ['economy', 'balanced', 'performant'];
export const CONTENT_MODES: readonly Project.ContentMode[] = ['standard', 'unrestricted'];
export const DEFAULT_COST_TIER: Project.CostTier = 'balanced';

export function isCostTier(value: unknown): value is Project.CostTier {
  return (COST_TIERS as readonly unknown[]).includes(value);
}

export function isContentMode(value: unknown): value is Project.ContentMode {
  return (CONTENT_MODES as readonly unknown[]).includes(value);
}

const openrouter = (model: string): ResolvedModel => ({ provider: 'openrouter', model });

// The gateway ignores per-request reasoning effort (it caps effort per instance), so a tier can only change cost by switching models.
// Balanced is the pair of group maps above, so a project that never picks a tier keeps today's routing; image, vision and embedding
// stay fixed across tiers because they have no cheaper capable model (vision) or no alternative at all (image allowlist, pgvector width).
export const COST_TIER_DEFAULTS: Record<Project.CostTier, Record<Project.ContentMode, Record<ModelGroup, ResolvedModel>>> = {
  economy: {
    standard: {
      ...PRODUCTION_GROUP_DEFAULTS,
      writing: openrouter('anthropic/claude-haiku-4.5'),
      planning: openrouter('anthropic/claude-sonnet-5'),
      review: openrouter('anthropic/claude-haiku-4.5'),
      chat: openrouter('anthropic/claude-sonnet-5'),
    },
    unrestricted: {
      ...UNRESTRICTED_GROUP_DEFAULTS,
      writing: openrouter('deepseek/deepseek-v4-pro'),
      planning: openrouter('deepseek/deepseek-v4-pro'),
      chat: openrouter('deepseek/deepseek-v4-pro'),
    },
  },
  balanced: { standard: PRODUCTION_GROUP_DEFAULTS, unrestricted: UNRESTRICTED_GROUP_DEFAULTS },
  performant: {
    standard: {
      ...PRODUCTION_GROUP_DEFAULTS,
      writing: openrouter('anthropic/claude-opus-5.5'),
      review: openrouter('anthropic/claude-opus-5.5'),
      helper: openrouter('anthropic/claude-haiku-4.5'),
    },
    unrestricted: {
      ...UNRESTRICTED_GROUP_DEFAULTS,
      writing: openrouter('moonshotai/kimi-k3'),
      planning: openrouter('moonshotai/kimi-k3'),
      review: openrouter('moonshotai/kimi-k3'),
      chat: openrouter('moonshotai/kimi-k3'),
      helper: openrouter('z-ai/glm-5.2'),
    },
  },
};

// How hard each group is allowed to think. Hidden reasoning tokens bill as output, so the mechanical
// helper roles (title, compact) ask for none at all; every other authoring group buys the
// cheapest tier its model offers rather than the provider default — except `planning`, pinned to medium
// for Opus.
export const REASONING_POLICY: Record<ModelGroup, ReasoningEffort> = {
  writing: 'low',
  planning: 'medium',
  review: 'low',
  chat: 'low',
  helper: 'none',
  image: 'none',
  vision: 'none',
  embedding: 'none',
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
