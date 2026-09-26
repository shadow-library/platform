import {
  type AiModelOption,
  type AiTierModel,
  type ContentMode,
  type CostTier,
  type ProjectModelOverrides,
  type ProjectModelRef,
  type UpdateProjectBody,
} from './apis/api-types.gen';

export type ModelGroup = 'writing' | 'planning' | 'review' | 'chat' | 'helper' | 'image';

/**
 * The author-facing name for a model id. A model the registry no longer lists — a retired pin still stored on a
 * project — falls back to its id, the only thing left that identifies it.
 */
export function modelLabel(registry: readonly AiModelOption[], model: string | null | undefined, provider?: string | null): string | undefined {
  if (!model) return undefined;
  const match = registry.find(option => option.id === model && (!provider || option.provider === provider));
  return match?.label ?? model;
}

export interface InheritedModel {
  provider: string;
  model: string;
}

/** What a group falls back to when neither a chat nor the project names a model, mirroring the server router: the platform's model for the tier. */
export function inheritedModel(group: ModelGroup, tiers: readonly AiTierModel[], costTier: CostTier, contentMode: ContentMode): InheritedModel | undefined {
  const entry = tiers.find(tier => tier.group === group && tier.costTier === costTier && tier.contentMode === contentMode);
  return entry && { provider: entry.provider, model: entry.model };
}

export interface ModelSavePick {
  roles: readonly (keyof ProjectModelOverrides)[];
  ref: ProjectModelRef | null;
}

export interface ModelSaveInput {
  contentMode: ContentMode;
  costTier: CostTier;
  /** Absent while the registry is loading or failed: the allowlist is unknown, so the stored per-job picks must not be rewritten. */
  unrestrictedAllowlist?: readonly string[];
  picks: readonly ModelSavePick[];
  embedding?: ProjectModelRef;
}

export function modelSaveBody({ contentMode, costTier, unrestrictedAllowlist, picks, embedding }: ModelSaveInput): UpdateProjectBody {
  if (!unrestrictedAllowlist) return { contentMode, costTier };
  const allowed = contentMode === 'unrestricted' ? new Set(unrestrictedAllowlist) : undefined;
  const models: ProjectModelOverrides = embedding ? { embedding } : {};
  for (const { roles, ref } of picks) {
    if (!ref || (allowed && !allowed.has(ref.model))) continue;
    for (const role of roles) models[role] = ref;
  }
  return { contentMode, costTier, config: { models } };
}
