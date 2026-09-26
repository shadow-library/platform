import {
  type AccountModelDefaults,
  type AiModelOption,
  type AiRoleDefault,
  type ContentMode,
  type CostTier,
  type ProjectModelOverrides,
  type ProjectModelRef,
  type UpdateProjectBody,
} from './apis/api-types.gen';

export type AccountModelGroup = keyof AccountModelDefaults;

/**
 * The author-facing name for a model id. A model the registry no longer lists — a retired pin still stored on an
 * account or a project — falls back to its id, the only thing left that identifies it.
 */
export function modelLabel(registry: readonly AiModelOption[], model: string | null | undefined, provider?: string | null): string | undefined {
  if (!model) return undefined;
  const match = registry.find(option => option.id === model && (!provider || option.provider === provider));
  return match?.label ?? model;
}

export interface InheritedModel {
  provider: string;
  model: string;
  source: 'account' | 'platform';
}

/**
 * What a group falls back to when neither a chat nor the project names a model, mirroring the server router: the
 * owner's default while the registry still lists it (and, on an unrestricted project, the allowlist carries it),
 * otherwise the platform's.
 */
export function inheritedModel(
  group: AccountModelGroup,
  account: AccountModelDefaults | undefined,
  platform: readonly AiRoleDefault[],
  registry: readonly AiModelOption[],
  allowlist?: ReadonlySet<string>,
): InheritedModel | undefined {
  const own = account?.[group];
  const listed = own && registry.some(option => option.provider === own.provider && option.id === own.model);
  if (own && listed && (!allowlist || allowlist.has(own.model))) return { provider: own.provider, model: own.model, source: 'account' };
  const fallback = platform.find(entry => entry.role === group);
  return fallback && { provider: fallback.provider, model: fallback.model, source: 'platform' };
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
