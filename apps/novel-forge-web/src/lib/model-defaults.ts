import { type AccountModelDefaults, type AiModelOption, type AiRoleDefault } from './apis/api-types.gen';

export type AccountModelGroup = keyof AccountModelDefaults;

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
