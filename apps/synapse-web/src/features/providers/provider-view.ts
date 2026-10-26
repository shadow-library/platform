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
import { isRecord, text } from '@/features/catalog/catalog-values';
import { credentialsForUrl, type KeyStatus, keyStatusOf, originHost, originOfUrl } from '@/features/credentials/credential-view';
import { providerName } from '@/features/shared/naming';
import { type CredentialResponse, type ProviderResponse } from '@/lib/apis/api-types.gen';

export type ProviderHealth = { kind: 'measured'; calls: number; errors: number; errorRate?: number } | { kind: 'unavailable' };

export type ProviderKeyStatus = KeyStatus | { kind: 'none' } | { kind: 'legacy_setting' };

export interface ProviderRow {
  key: string;
  name: string;
  entry: ProviderEntry;
  health: ProviderHealth;
  /** Whether the deprecated Config key holds a value; unknown while the health is loading or could not be read */
  apiKeyConfigured?: boolean;
}

export interface ProviderRowsInput {
  document: CatalogDocument;
  /** `undefined` while the live health is loading or could not be read */
  health: readonly ProviderResponse[] | undefined;
}

export interface ProviderUser {
  key: string;
  name: string;
}

export type StrandedFix =
  { kind: 'use'; credential: Pick<CredentialResponse, 'id' | 'name'> } | { kind: 'pick' } | { kind: 'add'; origin: string } | { kind: 'ask' } | { kind: 'unlisted' };

export interface StrandedProvider {
  row: ProviderRow;
  fix: StrandedFix;
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

const FEATURE_NAMES: Readonly<Record<ProviderFeature, string>> = { sessions: 'Sessions', native_web_search: 'Own web search', image_input: 'Image input' };

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

/** One line for the provider cell; a missing setting names itself rather than reading as a bare "Not set". */
export function providerFacts(entry: Pick<ProviderEntry, 'kind' | 'flavor' | 'locality' | 'cost'>): string {
  return [
    entry.kind === undefined ? 'Kind not set' : kindName(entry.kind, entry.flavor),
    entry.locality ? LOCALITY_NAMES[entry.locality] : 'Where it runs not set',
    entry.cost ? COST_NAMES[entry.cost] : 'Cost not set',
  ].join(' · ');
}

export function legacyKeyLabel(alongside: boolean): string {
  return alongside ? 'The old environment key setting is also set' : 'Uses the old environment key setting';
}

export function healthWindowSentence(windowHours: number, catalogVersion: number): string {
  return `Calls and errors over the last ${windowHours} hours, from version ${catalogVersion}.`;
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

const byName = (left: ProviderRow, right: ProviderRow): number => left.name.localeCompare(right.name) || left.key.localeCompare(right.key);

export function providerRows(input: ProviderRowsInput): ProviderRow[] {
  const liveByKey = new Map((input.health ?? []).map(live => [live.key, live]));
  return readProviders(input.document)
    .map(entry => {
      const live = liveByKey.get(entry.key);
      return {
        key: entry.key,
        name: providerName(entry.key),
        entry,
        health: measured(live),
        ...(live?.apiKeyConfigured !== undefined && { apiKeyConfigured: live.apiKeyConfigured }),
      };
    })
    .sort(byName);
}

export function providerKeyStatus(row: Pick<ProviderRow, 'entry' | 'apiKeyConfigured'>, credentials?: readonly CredentialResponse[]): ProviderKeyStatus {
  const { entry } = row;
  if (entry.kind === 'ollama') return { kind: 'not_needed' };
  if (entry.credential === undefined && entry.apiKeyConfig === undefined && row.apiKeyConfigured === undefined) return { kind: 'none' };
  if (entry.credential === undefined && row.apiKeyConfigured === undefined) return { kind: 'legacy_setting' };
  return keyStatusOf({ ...(entry.credential !== undefined && { credential: entry.credential }), apiKeyConfigured: row.apiKeyConfigured }, credentials);
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

/** `credentials` is undefined while the stored keys are loading or couldn't be listed. */
function strandedFix(row: ProviderRow, credentials: readonly CredentialResponse[] | undefined, canSwitch: boolean): StrandedFix {
  if (!canSwitch) return { kind: 'ask' };
  if (credentials === undefined) return { kind: 'unlisted' };
  const [only, ...others] = credentialsForUrl(credentials, row.entry.url);
  if (only && others.length === 0) return { kind: 'use', credential: only };
  if (only) return { kind: 'pick' };
  const origin = originOfUrl(row.entry.url);
  return origin === null ? { kind: 'ask' } : { kind: 'add', origin };
}

/** `apiKeyConfigured` comes from the server, which alone can see whether the old environment key setting holds a key. */
export function strandedProviders(rows: readonly ProviderRow[], credentials: readonly CredentialResponse[] | undefined, canSwitch: boolean): StrandedProvider[] {
  return rows
    .filter(row => row.entry.kind !== 'ollama' && row.entry.credential === undefined && row.entry.apiKeyConfig !== undefined && row.apiKeyConfigured === false)
    .map(row => ({ row, fix: strandedFix(row, credentials, canSwitch) }));
}

function nextStep(fix: StrandedFix): string | null {
  switch (fix.kind) {
    case 'use':
      return `“${fix.credential.name}” is stored for its address.`;
    case 'pick':
      return 'Pick one of the stored keys for its address in the API key column below.';
    case 'add':
      return `Add a key for ${originHost(fix.origin)} on the Credentials screen, then pick it here.`;
    case 'ask':
      return 'Ask a Synapse administrator to switch it to a stored key.';
    case 'unlisted':
      return null;
  }
}

export function strandedNotice({ row, fix }: StrandedProvider): { title: string; body: string } {
  const cause = 'It still uses the old environment key setting, which holds no key, so every call to it fails until it is switched to a stored key.';
  const next = nextStep(fix);
  return { title: `${row.name} can't make calls`, body: next ? `${cause} ${next}` : cause };
}
