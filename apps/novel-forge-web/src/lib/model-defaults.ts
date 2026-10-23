import { type AiModelLabel, type AiModelOption, type AiModelsResponse, type AiTierModel, type ChatSessionResponse, type ContentMode, type CostTier } from './apis/api-types.gen';
import { decodeModelRef, encodeModelRef } from './format';

export type ModelGroup = 'writing' | 'planning' | 'review' | 'chat' | 'helper' | 'image';

type ModelNames = Pick<AiModelsResponse, 'models' | 'modelLabels'>;

/**
 * The author-facing name for a recorded or pinned model: a pickable option first, then the server's names for the model keys calls, replies and
 * reviews record. Anything neither names — a retired pin, or an old run's model — falls back to its key, the only thing left that identifies it.
 */
export function modelLabel(names: ModelNames | undefined, model: string | null | undefined, provider?: string | null): string | undefined {
  if (!model) return undefined;
  const option = names?.models.find(entry => entry.id === model && (!provider || entry.provider === provider));
  return option?.label ?? names?.modelLabels.find(entry => entry.model === model)?.label ?? model;
}

/** A recorded model's list price, for estimating an old call that recorded no cost; `null` once the names are known and none prices it. */
export function modelPrice(names: ModelNames | undefined, model: string): AiModelOption | AiModelLabel | null | undefined {
  if (!names) return undefined;
  return names.models.find(entry => entry.id === model) ?? names.modelLabels.find(entry => entry.model === model) ?? null;
}

export interface InheritedModel {
  provider: string;
  model: string;
  label: string;
}

/** What a group runs on when the chat names no model, mirroring the server router: the platform's model for the tier. */
export function inheritedModel(group: ModelGroup, tiers: readonly AiTierModel[], costTier: CostTier, contentMode: ContentMode): InheritedModel | undefined {
  const entry = tiers.find(tier => tier.group === group && tier.costTier === costTier && tier.contentMode === contentMode);
  return entry && { provider: entry.provider, model: entry.model, label: entry.label };
}

export const DEFAULT_PIN = 'default';

export interface PinChoice {
  value: string;
  label: string;
}

export interface PinMenu {
  value: string;
  /** What the closed menu shows: the pinned model, or the default with the model it resolves to. */
  triggerLabel: string;
  defaultLabel: string;
  choices: PinChoice[];
}

type PinnedSession = Pick<ChatSessionResponse, 'modelProvider' | 'modelId'>;

/**
 * The chat-model pin menu: the default first, then the options `offered` for the chat's own model type and cost tier — Synapse aliases, as
 * the server sends them. Until that selection's offer has loaded only the default is listed.
 */
export function pinMenu(
  models: AiModelsResponse | undefined,
  session: PinnedSession | undefined,
  offered: readonly string[] | undefined,
  resolvedDefault?: InheritedModel,
): PinMenu {
  const available = new Set(offered ?? []);
  const options = (models?.models ?? []).filter(option => option.kind === 'llm' && option.enabled && available.has(option.id));
  const defaultLabel = resolvedDefault ? `Default · ${resolvedDefault.label}` : 'Default';
  const pinned = session?.modelProvider && session.modelId ? { provider: session.modelProvider, model: session.modelId } : undefined;
  return {
    value: pinned ? encodeModelRef(pinned.provider, pinned.model) : DEFAULT_PIN,
    triggerLabel: pinned ? (modelLabel(models, pinned.model, pinned.provider) ?? pinned.model) : defaultLabel,
    defaultLabel,
    choices: options.map(option => ({ value: encodeModelRef(option.provider, option.id), label: option.label })),
  };
}

/** The PATCH body for a menu pick: the option's own provider and id — `synapse` and the alias key for an alias — or both null for the default. */
export function pinUpdate(value: string): { provider: string | null; model: string | null } {
  return value === DEFAULT_PIN ? { provider: null, model: null } : decodeModelRef(value);
}
