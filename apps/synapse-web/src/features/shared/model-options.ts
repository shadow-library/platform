import { type Capability, type DataPolicy, type ModelEntry, type ModelPrice, type ProviderEntry, type TaskKind } from '@/features/catalog/catalog-spec.types';

import { formatPrice } from './format';
import { capabilityName, modelName, providerName, taskKindName } from './naming';

export interface ModelNeeds {
  requires?: readonly Capability[];
  kind?: TaskKind;
  dataPolicy?: DataPolicy;
  /** Needed for the data-policy hint; a provider missing here, or without a locality, never makes a model ineligible. */
  providers?: readonly Pick<ProviderEntry, 'key' | 'locality'>[];
}

export type ModelEligibility = { eligible: true } | { eligible: false; reasons: string[] };

const SHOWN_CAPABILITIES: readonly Capability[] = ['tools', 'structured_output', 'vision', 'image_output', 'embedding'];

/** Mirrors synapse-server's `modelSupports`: structured output always holds, because the server injects the schema into the prompt otherwise. */
export function modelSupports(model: Pick<ModelEntry, 'capabilities'>, capability: Capability): boolean {
  const capabilities = model.capabilities;
  switch (capability) {
    case 'tools':
      return capabilities.tools;
    case 'structured_output':
      return true;
    case 'vision':
      return capabilities.vision;
    case 'streaming':
      return capabilities.embedding === undefined;
    case 'image_output':
      return capabilities.imageOutput === true;
    case 'embedding':
      return capabilities.embedding !== undefined;
  }
}

/** Mirrors synapse-server's `modelServesKind`. */
export function modelServesKind(model: Pick<ModelEntry, 'capabilities'>, kind: TaskKind): boolean {
  if (kind === 'embedding') return model.capabilities.embedding !== undefined;
  if (kind === 'image') return model.capabilities.imageOutput === true;
  return model.capabilities.embedding === undefined;
}

function outsideCluster(model: Pick<ModelEntry, 'deployments'>, providers: readonly Pick<ProviderEntry, 'key' | 'locality'>[]): string[] {
  const localities = new Map(providers.map(provider => [provider.key, provider.locality]));
  const outside = model.deployments.filter(deployment => {
    const locality = localities.get(deployment.provider);
    return locality !== undefined && locality !== 'in_cluster';
  });
  return [...new Set(outside.map(deployment => deployment.provider))];
}

/** A display hint only: the server validates every rule on each change, so this never blocks one. */
export function modelEligibility(model: Pick<ModelEntry, 'capabilities' | 'deployments'>, needs: ModelNeeds): ModelEligibility {
  const reasons: string[] = [];
  if (needs.kind && !modelServesKind(model, needs.kind)) reasons.push(`Can't serve ${taskKindName(needs.kind).toLowerCase()} features`);
  for (const capability of needs.requires ?? []) {
    if (!modelSupports(model, capability)) reasons.push(`Doesn't support ${capabilityName(capability).toLowerCase()}`);
  }
  if (needs.dataPolicy === 'in_cluster_only' && needs.providers) {
    const outside = outsideCluster(model, needs.providers);
    if (outside.length > 0) reasons.push(`Runs outside our cluster, on ${outside.map(providerName).join(', ')}`);
  }
  return reasons.length === 0 ? { eligible: true } : { eligible: false, reasons };
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-token and case-insensitive, with an optional leading "v" on either side, so "DeepSeek V4 Pro" holds "v4" but "Opus 5.5" does not hold "5". */
export function nameHoldsVersion(name: string, version: string): boolean {
  const bare = version.trim().replace(/^v(?=\d)/i, '');
  if (bare === '') return true;
  return new RegExp(`(?<![\\p{L}\\p{N}.])v?${escapeRegExp(bare)}(?![\\p{L}\\p{N}]|\\.\\p{N})`, 'iu').test(name);
}

export function modelDisplayName(model: Pick<ModelEntry, 'key' | 'label' | 'version'>): string {
  const name = modelName(model);
  const version = model.version?.trim();
  return version && !nameHoldsVersion(name, version) ? `${name} ${version}` : name;
}

export function modelPriceText(price: ModelPrice): string {
  const tokens = `${formatPrice(price.input)} in / ${formatPrice(price.output)} out per M tokens`;
  return price.perImage === undefined ? tokens : `${tokens} · ${formatPrice(price.perImage)} per image`;
}

export function modelCapabilityNames(model: Pick<ModelEntry, 'capabilities'>): string[] {
  const capabilities = model.capabilities;
  const held: Record<string, boolean> = {
    tools: capabilities.tools,
    structured_output: capabilities.structuredOutput === 'native',
    vision: capabilities.vision,
    image_output: capabilities.imageOutput === true,
    embedding: capabilities.embedding !== undefined,
  };
  return SHOWN_CAPABILITIES.filter(capability => held[capability]).map(capabilityName);
}
