import { type AiModelOption, type AiTierModel, type ContentMode, type CostTier } from './apis/api-types.gen';

export type ModelGroup = 'writing' | 'planning' | 'review' | 'chat' | 'helper' | 'image';

/**
 * The author-facing name for a model id. A model the registry no longer lists — a retired pin still stored on a
 * chat, or an old run's model — falls back to its id, the only thing left that identifies it.
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

/** What a group runs on when the chat names no model, mirroring the server router: the platform's model for the tier. */
export function inheritedModel(group: ModelGroup, tiers: readonly AiTierModel[], costTier: CostTier, contentMode: ContentMode): InheritedModel | undefined {
  const entry = tiers.find(tier => tier.group === group && tier.costTier === costTier && tier.contentMode === contentMode);
  return entry && { provider: entry.provider, model: entry.model };
}
