import { type Project } from '@server/database';

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

/** A provider and model as a record names them: the catalog model that answered a call, or Synapse and the task it was routed to. */
export interface ResolvedModel {
  provider: string;
  model: string;
}

export type ModelGroup = 'writing' | 'planning' | 'review' | 'chat' | 'helper' | 'image' | 'vision' | 'embedding';

// `embedding` is locked to the pgvector dimension and `vision` must stay image-capable, so an author never picks either.
export type SelectableModelGroup = Exclude<ModelGroup, 'vision' | 'embedding'>;

export const SELECTABLE_MODEL_GROUPS: readonly SelectableModelGroup[] = ['writing', 'planning', 'review', 'chat', 'helper', 'image'];

// Every fine-grained role maps to exactly one model group, and each group is one Synapse task. Roles stay fine-grained internally (prompts
// and telemetry); the group is what Synapse routes.
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
  // Not author-selectable: a chat's pick for a text-only group must never strip image input from a caller that needs it.
  vision: 'vision',
  embedding: 'embedding',
};

export const COST_TIERS: readonly Project.CostTier[] = ['economy', 'balanced', 'performant'];
export const CONTENT_MODES: readonly Project.ContentMode[] = ['standard', 'unrestricted'];
export const DEFAULT_COST_TIER: Project.CostTier = 'balanced';

export function isCostTier(value: unknown): value is Project.CostTier {
  return (COST_TIERS as readonly unknown[]).includes(value);
}

export function isContentMode(value: unknown): value is Project.ContentMode {
  return (CONTENT_MODES as readonly unknown[]).includes(value);
}
