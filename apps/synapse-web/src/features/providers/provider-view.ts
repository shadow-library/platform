import { type BadgeIntent } from '@shadow-library/ui';

import { type CatalogDocument } from '@/features/catalog/catalog-document';
import {
  PROVIDER_FEATURES,
  type ProviderCost,
  type ProviderEntry,
  type ProviderFeature,
  type ProviderFlavor,
  type ProviderKind,
  type ProviderLocality,
} from '@/features/catalog/catalog-spec.types';
import { readProviders } from '@/features/catalog/catalog-readers';
import { isRecord, isSameValue, ownEntry, text } from '@/features/catalog/catalog-values';
import { type KeyStatus, keyStatusOf } from '@/features/credentials/credential-view';
import { type DraftAction } from '@/features/shared/draft-notice';
import { providerName } from '@/features/shared/naming';
import { type CredentialResponse, type ProviderResponse } from '@/lib/apis/api-types.gen';

export type ProviderPresence = 'live' | 'changed' | 'draft_only' | 'removed_in_draft' | 'unknown';

export type ProviderHealth = { kind: 'measured'; calls: number; errors: number; errorRate?: number } | { kind: 'not_live' } | { kind: 'unavailable' };

export type ProviderKeyStatus = KeyStatus | { kind: 'none' } | { kind: 'legacy_setting' };

export type CatalogSource = 'draft' | 'active';

export interface ProviderRow {
  key: string;
  name: string;
  entry: ProviderEntry;
  presence: ProviderPresence;
  health: ProviderHealth;
  /** Whether the deprecated Config key holds a value, known only while the draft names the same one as the published catalog */
  apiKeyConfigured?: boolean;
}

export interface ProviderRowsInput {
  /** The draft, or the published document when there is no draft */
  working: CatalogDocument;
  /** The published document; `undefined` while it is loading or could not be read */
  active: CatalogDocument | undefined;
  /** `undefined` while the live health is loading or could not be read */
  health: readonly ProviderResponse[] | undefined;
}

export interface ProviderUser {
  key: string;
  name: string;
}

const WARNING_ERROR_RATE = 0.01;
const DANGER_ERROR_RATE = 0.1;

const KIND_NAMES: Readonly<Record<ProviderKind, string>> = { openai: 'OpenAI-compatible', ollama: 'Ollama', mock: 'Test stand-in' };

const FLAVOR_NAMES: Readonly<Record<ProviderFlavor, string>> = {
  openrouter: 'OpenRouter',
  'subscription-gateway': 'Subscription gateway',
  'openai-compatible': 'OpenAI-compatible API',
};

const LOCALITY_NAMES: Readonly<Record<ProviderLocality, string>> = { in_cluster: 'Inside our cluster', host: 'On the host', third_party: 'Third party' };

const COST_NAMES: Readonly<Record<ProviderCost, string>> = { zero: 'Free', metered: 'Metered' };

const FEATURE_NAMES: Readonly<Record<ProviderFeature, string>> = { sessions: 'Sessions', native_web_search: 'Web search', image_input: 'Image input' };

export const KIND_DESCRIPTIONS: Readonly<Record<ProviderKind, string>> = {
  openai: 'Speaks the OpenAI API: OpenRouter, the subscription gateway or another compatible service',
  ollama: 'A local Ollama server; it never needs a key',
  mock: 'Answers with canned replies, for tests',
};

export const FLAVOR_DESCRIPTIONS: Readonly<Record<ProviderFlavor, string>> = {
  openrouter: 'The OpenRouter marketplace',
  'subscription-gateway': 'Our gateway to the AI subscriptions on the host',
  'openai-compatible': 'Any other service that speaks the OpenAI API',
};

export const LOCALITY_DESCRIPTIONS: Readonly<Record<ProviderLocality, string>> = {
  in_cluster: 'Data never leaves our cluster, so it can serve features restricted to it',
  host: 'Runs on the machine that hosts the cluster',
  third_party: 'An outside company handles the data',
};

export const COST_DESCRIPTIONS: Readonly<Record<ProviderCost, string>> = {
  zero: 'Calls cost us nothing extra, such as a subscription or our own hardware',
  metered: 'The provider bills each call',
};

export function kindName(kind: ProviderKind | undefined, flavor?: ProviderFlavor): string {
  if (kind === undefined) return 'Not set';
  if (kind !== 'openai') return KIND_NAMES[kind];
  return flavor ? FLAVOR_NAMES[flavor] : `${KIND_NAMES.openai} (service not set)`;
}

export function kindLabel(kind: ProviderKind): string {
  return KIND_NAMES[kind];
}

export function flavorName(flavor: ProviderFlavor): string {
  return FLAVOR_NAMES[flavor];
}

export function localityName(locality: ProviderLocality | undefined): string {
  return locality ? LOCALITY_NAMES[locality] : 'Not set';
}

export function costName(cost: ProviderCost | undefined): string {
  return cost ? COST_NAMES[cost] : 'Not set';
}

export function featureName(feature: ProviderFeature): string {
  return FEATURE_NAMES[feature];
}

export function sortFeatures(features: readonly string[]): ProviderFeature[] {
  return PROVIDER_FEATURES.filter(feature => features.includes(feature));
}

export function errorRateIntent(rate?: number): BadgeIntent {
  if (rate == null || rate < WARNING_ERROR_RATE) return 'success';
  return rate < DANGER_ERROR_RATE ? 'warning' : 'danger';
}

function measured(live: ProviderResponse | undefined): ProviderHealth {
  if (!live) return { kind: 'unavailable' };
  return { kind: 'measured', calls: live.calls, errors: live.errors, ...(live.errorRate !== undefined && { errorRate: live.errorRate }) };
}

function rawProviders(document: CatalogDocument): Record<string, unknown> {
  return isRecord(document.providers) ? document.providers : {};
}

function presenceOf(key: string, working: Record<string, unknown>, active: Record<string, unknown> | undefined): ProviderPresence {
  if (active === undefined) return 'unknown';
  if (!Object.hasOwn(active, key)) return 'draft_only';
  return isSameValue(ownEntry(working, key), ownEntry(active, key)) ? 'live' : 'changed';
}

/** The health endpoint reports whether the published Config key holds a value, which says nothing about a key the draft names instead. */
function configuredOf(key: string, working: Record<string, unknown>, active: Record<string, unknown> | undefined, live: ProviderResponse | undefined): boolean | undefined {
  if (active === undefined || live?.apiKeyConfigured === undefined) return undefined;
  const draft = ownEntry(working, key);
  const published = ownEntry(active, key);
  if (!isRecord(draft) || !isRecord(published) || draft.apiKeyConfig !== published.apiKeyConfig) return undefined;
  return live.apiKeyConfigured;
}

function readOne(key: string, raw: unknown): ProviderEntry {
  return readProviders({ providers: Object.fromEntries([[key, raw]]) })[0] ?? { key, url: '', features: [] };
}

const byName = (left: ProviderRow, right: ProviderRow): number => left.name.localeCompare(right.name) || left.key.localeCompare(right.key);

/** Presence compares the raw entries, so a change the readers cannot show (an unknown field, a malformed value) still marks the provider as changed. */
export function providerRows(input: ProviderRowsInput): ProviderRow[] {
  const working = rawProviders(input.working);
  const active = input.active ? rawProviders(input.active) : undefined;
  const liveByKey = new Map((input.health ?? []).map(live => [live.key, live]));
  const rowOf = (key: string, entry: ProviderEntry, presence: ProviderPresence, apiKeyConfigured: boolean | undefined): ProviderRow => ({
    key,
    name: providerName(key),
    entry,
    presence,
    health: presence === 'draft_only' ? { kind: 'not_live' } : measured(liveByKey.get(key)),
    ...(apiKeyConfigured !== undefined && { apiKeyConfigured }),
  });
  const rows = readProviders(input.working).map(entry =>
    rowOf(entry.key, entry, presenceOf(entry.key, working, active), configuredOf(entry.key, working, active, liveByKey.get(entry.key))),
  );
  const removed = Object.keys(active ?? {})
    .filter(key => !Object.hasOwn(working, key))
    .map(key => rowOf(key, readOne(key, ownEntry(active ?? {}, key)), 'removed_in_draft', liveByKey.get(key)?.apiKeyConfigured));
  return [...rows, ...removed].sort(byName);
}

export function providerKeyStatus(row: Pick<ProviderRow, 'entry' | 'apiKeyConfigured'>, credentials?: readonly CredentialResponse[]): ProviderKeyStatus {
  const { entry } = row;
  if (entry.kind === 'ollama') return { kind: 'not_needed' };
  if (entry.credential === undefined && entry.apiKeyConfig === undefined && row.apiKeyConfigured === undefined) return { kind: 'none' };
  if (entry.credential === undefined && row.apiKeyConfigured === undefined) return { kind: 'legacy_setting' };
  return keyStatusOf({ ...(entry.credential !== undefined && { credential: entry.credential }), apiKeyConfigured: row.apiKeyConfigured }, credentials);
}

export function presenceLabel(presence: ProviderPresence): string | undefined {
  switch (presence) {
    case 'changed':
      return 'Changed in the draft';
    case 'draft_only':
      return 'Not live yet';
    case 'removed_in_draft':
      return 'Removed in the draft';
    case 'live':
    case 'unknown':
      return undefined;
  }
}

/** Keys of every entry, the ones the reader skips as malformed included, so a new provider can never overwrite one. */
export function providerKeysOf(document: CatalogDocument): string[] {
  return isRecord(document.providers) ? Object.keys(document.providers) : [];
}

export function unreadableProviderCount(document: CatalogDocument, readable: readonly ProviderEntry[]): number {
  return Math.max(0, providerKeysOf(document).length - readable.length);
}

/** Reads the raw models, so a model the readers skip as malformed still keeps its provider from being removed. */
export function providerUsers(document: CatalogDocument, providerKey: string): ProviderUser[] {
  if (!isRecord(document.models)) return [];
  return Object.entries(document.models)
    .filter(([, model]) => isRecord(model) && Array.isArray(model.deployments) && model.deployments.some(row => isRecord(row) && row.provider === providerKey))
    .map(([key, model]) => ({ key, name: (isRecord(model) && text(model.label)?.trim()) || key }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function usersSentence(users: readonly ProviderUser[]): string {
  return users.length === 0 ? 'No model uses it' : `Used by ${users.map(user => user.name).join(', ')}`;
}

export function defaultProviderNote(name: string, action: DraftAction): string {
  return `Provider ${name} ${action}`;
}
