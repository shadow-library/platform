import { type CatalogDocument, type DocumentEdit } from '@/features/catalog/catalog-document';
import { withoutProviderCredential, withProvider, withProviderCredential } from '@/features/catalog/catalog-edits';
import { CATALOG_KEY_HINT, CATALOG_KEY_PATTERN } from '@/features/catalog/catalog-keys';
import { readProviders } from '@/features/catalog/catalog-readers';
import {
  type ProviderCost,
  type ProviderEntry,
  type ProviderFeature,
  type ProviderFlavor,
  type ProviderKind,
  type ProviderLocality,
  type ProviderSpec,
} from '@/features/catalog/catalog-spec.types';
import { isRecord, isSameValue, ownEntry, text } from '@/features/catalog/catalog-values';
import { type CatalogEdit } from '@/features/catalog/catalog-change';
import { originOfUrl } from '@/features/credentials/credential-view';
import { type CredentialResponse } from '@/lib/apis/api-types.gen';

import { providerKeysOf, providerUsers, sortFeatures, usersSentence } from './provider-view';

export const CONCURRENT_PROVIDER_CHANGE = 'Someone else changed this provider while you were editing. Reopen it to see their change.';

export const CONCURRENT_KEY_CHANGE = "Someone else changed this provider's API key meanwhile. The table now shows their choice; pick again if you still want to change it.";

const HTTP_PROTOCOLS = ['http:', 'https:'];

export type ProviderEditorMode = { kind: 'add' } | { kind: 'edit'; key: string };

export interface ProviderForm {
  key: string;
  kind: ProviderKind | '';
  /** Kept while another kind is picked, so switching back restores it; only an `openai` provider saves it */
  flavor: ProviderFlavor | '';
  url: string;
  locality: ProviderLocality | '';
  cost: ProviderCost | '';
  features: ProviderFeature[];
  maxInflightPerReplica: number | null;
  credential: string;
  /** The deprecated Config key name the provider still carries; the form never sets one */
  apiKeyConfig: string;
}

export type ProviderFormField = 'key' | 'kind' | 'flavor' | 'url' | 'locality' | 'cost' | 'maxInflightPerReplica';

export type ProviderFormErrors = Partial<Record<ProviderFormField, string>>;

export type ProviderFormResult = { ok: true; key: string; spec: ProviderSpec } | { ok: false; errors: ProviderFormErrors };

export interface ProviderFormContext {
  mode: ProviderEditorMode;
  takenKeys: readonly string[];
}

export interface KeySnapshot {
  credential?: string;
  apiKeyConfig?: string;
}

export type EditableProviderField = 'kind' | 'flavor' | 'url' | 'credential' | 'locality' | 'cost' | 'features' | 'maxInflightPerReplica';

const EDITABLE_FIELDS: readonly EditableProviderField[] = ['kind', 'flavor', 'url', 'credential', 'locality', 'cost', 'features', 'maxInflightPerReplica'];

type Entry = Record<string, unknown>;

export function emptyProviderForm(): ProviderForm {
  return { key: '', kind: '', flavor: '', url: '', locality: '', cost: '', features: [], maxInflightPerReplica: null, credential: '', apiKeyConfig: '' };
}

export function providerFormOf(provider: ProviderEntry): ProviderForm {
  return {
    key: provider.key,
    kind: provider.kind ?? '',
    flavor: provider.flavor ?? '',
    url: provider.url,
    locality: provider.locality ?? '',
    cost: provider.cost ?? '',
    features: sortFeatures(provider.features),
    maxInflightPerReplica: provider.maxInflightPerReplica ?? null,
    credential: provider.credential ?? '',
    apiKeyConfig: provider.apiKeyConfig ?? '',
  };
}

const orUndefined = <T extends string>(value: T | ''): T | undefined => (value === '' ? undefined : value);

function savedFlavor(form: ProviderForm): ProviderFlavor | undefined {
  return form.kind === 'openai' ? orUndefined(form.flavor) : undefined;
}

/** A stored credential replaces the deprecated Config key rather than joining it. */
function keyOf(form: ProviderForm): KeySnapshot {
  const credential = orUndefined(form.credential);
  const apiKeyConfig = credential ? undefined : orUndefined(form.apiKeyConfig);
  return { ...(credential && { credential }), ...(apiKeyConfig && { apiKeyConfig }) };
}

function savedKey(form: ProviderForm): KeySnapshot {
  return keyOf(form.kind === 'ollama' ? { ...form, credential: '' } : form);
}

/** An ollama provider never sends a key, so switching to one lets go of the credential, and switching away restores the one the editor opened with. */
export function kindPatch(form: ProviderForm, kind: ProviderKind, initial: ProviderForm): Pick<ProviderForm, 'kind' | 'credential'> {
  if (kind === 'ollama') return { kind, credential: '' };
  return { kind, credential: form.kind === 'ollama' ? initial.credential : form.credential };
}

function urlError(input: string): string | undefined {
  const url = input.trim();
  if (url === '') return 'Enter the address';
  const parsed = URL.canParse(url) ? new URL(url) : undefined;
  if (!parsed || !HTTP_PROTOCOLS.includes(parsed.protocol)) return 'Enter an address starting with http:// or https://';
  return parsed.username || parsed.password ? "Don't put a login in the address; pick a stored API key instead" : undefined;
}

function keyError(key: string, context: ProviderFormContext): string | undefined {
  if (context.mode.kind === 'edit') return undefined;
  if (key === '') return 'Enter a key';
  if (!CATALOG_KEY_PATTERN.test(key)) return CATALOG_KEY_HINT;
  return context.takenKeys.includes(key) ? 'Another provider already uses this key' : undefined;
}

function capError(value: number | null): string | undefined {
  if (value === null) return undefined;
  return Number.isInteger(value) && value >= 1 ? undefined : 'Use a whole number of at least 1';
}

function specOf(form: ProviderForm, kind: ProviderKind, locality: ProviderLocality, cost: ProviderCost): ProviderSpec {
  const flavor = savedFlavor(form);
  return {
    kind,
    ...(flavor && { flavor }),
    url: form.url.trim(),
    ...savedKey(form),
    locality,
    cost,
    features: sortFeatures(form.features),
    ...(form.maxInflightPerReplica !== null && { maxInflightPerReplica: form.maxInflightPerReplica }),
  };
}

export function validateProviderForm(form: ProviderForm, context: ProviderFormContext): ProviderFormResult {
  const key = context.mode.kind === 'edit' ? context.mode.key : form.key.trim();
  const candidates: Record<ProviderFormField, string | undefined> = {
    key: keyError(key, context),
    kind: form.kind === '' ? 'Choose what kind of service this is' : undefined,
    flavor: form.kind === 'openai' && form.flavor === '' ? 'Choose which OpenAI-compatible service this is' : undefined,
    url: urlError(form.url),
    locality: form.locality === '' ? 'Choose where it runs' : undefined,
    cost: form.cost === '' ? 'Choose how it is paid for' : undefined,
    maxInflightPerReplica: capError(form.maxInflightPerReplica),
  };
  const errors = Object.fromEntries(Object.entries(candidates).filter(([, message]) => message !== undefined)) as ProviderFormErrors;
  if (Object.keys(errors).length > 0 || form.kind === '' || form.locality === '' || form.cost === '') return { ok: false, errors };
  return { ok: true, key, spec: specOf(form, form.kind, form.locality, form.cost) };
}

function projection(form: ProviderForm, field: EditableProviderField): unknown {
  switch (field) {
    case 'kind':
    case 'locality':
    case 'cost':
      return orUndefined(form[field]);
    case 'flavor':
      return savedFlavor(form);
    case 'url':
      return form.url.trim();
    case 'credential':
      return keyOf(form);
    case 'features':
      return sortFeatures(form.features);
    case 'maxInflightPerReplica':
      return form.maxInflightPerReplica ?? undefined;
  }
}

export function editedProviderFields(initial: ProviderForm, form: ProviderForm): EditableProviderField[] {
  return EDITABLE_FIELDS.filter(field => !isSameValue(projection(initial, field), projection(form, field)));
}

function withField(entry: Entry, field: string, value: unknown): Entry {
  if (value !== undefined) return { ...entry, [field]: value };
  const { [field]: _removed, ...rest } = entry;
  return rest;
}

/** Writes only the edited fields over the stored entry, so whatever the form cannot show (unknown fields, a malformed value) survives. */
function patchEntry(raw: Entry, fields: readonly EditableProviderField[], spec: ProviderSpec): Entry {
  let entry = raw;
  for (const field of fields) {
    if (field === 'credential') entry = withField(withField(entry, 'credential', spec.credential), 'apiKeyConfig', spec.apiKeyConfig);
    else if (field === 'features') entry = withField(entry, field, spec.features.length > 0 ? [...spec.features] : undefined);
    else entry = withField(entry, field, spec[field]);
  }
  return entry;
}

export function addProviderEdit(key: string, spec: ProviderSpec): CatalogEdit {
  return (document: CatalogDocument): DocumentEdit => {
    if (providerKeysOf(document).includes(key)) return { ok: false, reason: `The catalog already has a provider with the key "${key}"` };
    return withProvider(document, key, spec);
  };
}

function freshForm(key: string, raw: Entry): ProviderForm | undefined {
  const fresh = readProviders({ providers: Object.fromEntries([[key, raw]]) })[0];
  return fresh ? providerFormOf(fresh) : undefined;
}

/** Re-applied to the live catalog on every attempt: untouched fields keep what is stored now, and an edited field someone else also changed is refused. */
export function updateProviderEdit(key: string, initial: ProviderForm, form: ProviderForm, spec: ProviderSpec): CatalogEdit {
  const fields = editedProviderFields(initial, form);
  return (document: CatalogDocument): DocumentEdit => {
    const providers = document.providers;
    const raw = isRecord(providers) ? ownEntry(providers, key) : undefined;
    if (!isRecord(providers) || !isRecord(raw)) return { ok: false, reason: `The catalog no longer has the provider "${key}"; someone may have removed it` };
    if (fields.length === 0) return { ok: true, document };
    const current = freshForm(key, raw);
    if (!current || fields.some(field => !isSameValue(projection(current, field), projection(initial, field)))) return { ok: false, reason: CONCURRENT_PROVIDER_CHANGE };
    return { ok: true, document: { ...document, providers: { ...providers, [key]: patchEntry(raw, fields, spec) } } };
  };
}

/** Checked again on the catalog the removal is applied to, since a model may have started using the provider meanwhile. */
export function removeProviderEdit(key: string): CatalogEdit {
  return (document: CatalogDocument): DocumentEdit => {
    const providers = document.providers;
    if (!isRecord(providers) || !Object.hasOwn(providers, key)) return { ok: false, reason: `The catalog has no provider "${key}"` };
    const users = providerUsers(document, key);
    if (users.length > 0) return { ok: false, reason: `It is still in use. ${usersSentence(users)}.` };
    const { [key]: _removed, ...rest } = providers;
    return { ok: true, document: { ...document, providers: rest } };
  };
}

export function keySnapshotOf(provider: Pick<ProviderEntry, 'credential' | 'apiKeyConfig'>): KeySnapshot {
  return { ...(provider.credential !== undefined && { credential: provider.credential }), ...(provider.apiKeyConfig !== undefined && { apiKeyConfig: provider.apiKeyConfig }) };
}

/** Refused when the stored key differs from the one the table showed, so picking never overwrites a choice someone else just saved. */
export function assignCredentialEdit(key: string, seen: KeySnapshot, credentialId: string | null): CatalogEdit {
  return (document: CatalogDocument): DocumentEdit => {
    const providers = document.providers;
    const raw = isRecord(providers) ? ownEntry(providers, key) : undefined;
    if (!isRecord(raw)) return { ok: false, reason: `The catalog no longer has the provider "${key}"; someone may have removed it` };
    const stored: KeySnapshot = keySnapshotOf({ credential: text(raw.credential), apiKeyConfig: text(raw.apiKeyConfig) });
    if (!isSameValue(stored, seen)) return { ok: false, reason: CONCURRENT_KEY_CHANGE };
    return credentialId === null ? withoutProviderCredential(document, key) : withProviderCredential(document, key, credentialId);
  };
}

/** A key is only ever sent to the site it is bound to, so moving the URL elsewhere silently strands it until someone picks another. */
export function keyBindingWarning(form: ProviderForm, initialUrl: string, credentials?: readonly CredentialResponse[]): string | undefined {
  if (form.kind === 'ollama') return undefined;
  const origin = originOfUrl(form.url);
  if (origin === null) return undefined;
  const moved = originOfUrl(initialUrl) !== null && originOfUrl(initialUrl) !== origin;
  if (form.credential !== '') {
    const bound = credentials?.find(credential => credential.id === form.credential);
    if (bound && bound.allowedOrigin !== origin)
      return `The API key "${bound.name}" is only ever sent to ${bound.allowedOrigin}, so it can't be used at this address. Pick a key for ${origin}, or keep the old address.`;
    if (!bound && moved) return `The chosen API key is bound to the old address's site, so it can't be used at ${origin}. Pick a key for the new address.`;
    return undefined;
  }
  if (form.apiKeyConfig !== '' && moved) return `The old environment key setting only works with the provider's original site. Pick a stored API key for ${origin} instead.`;
  return undefined;
}
