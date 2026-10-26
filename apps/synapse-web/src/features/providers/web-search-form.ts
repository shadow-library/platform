import { type CatalogEdit, compareAndSet } from '@/features/catalog/catalog-change';
import { type CatalogDocument, type DocumentEdit } from '@/features/catalog/catalog-document';
import { editWebSearch, withoutWebSearch, withWebSearch, withWebSearchCredential } from '@/features/catalog/catalog-edits';
import { rawWebSearch, readWebSearch } from '@/features/catalog/catalog-readers';
import { type WebSearchKind, type WebSearchSpec } from '@/features/catalog/catalog-spec.types';
import { isRecord, isSameValue, text } from '@/features/catalog/catalog-values';

import { urlError } from './provider-form';

export const BRAVE_URL = 'https://api.search.brave.com';
export const MOCK_SEARCH_URL = 'http://search.mock';

/** synapse-server's parser limits on `tools.webSearch`. */
export const MAX_SEARCHES = 10;
export const MAX_SEARCH_RESULTS = 20;

const STARTING_MAX_SEARCHES = 3;
const STARTING_RESULTS = 5;

export const CONCURRENT_WEB_SEARCH_CHANGE = 'Someone else changed web search while you were editing. Reopen it to see their change.';

export const CONCURRENT_WEB_SEARCH_KEY_CHANGE =
  "Someone else changed web search's API key meanwhile. The screen now shows their choice; pick again if you still want to change it.";

export const WEB_SEARCH_ALREADY_SET_UP = 'Someone else set up web search while you were editing. Reopen it to see their settings.';

export type WebSearchEditorMode = 'add' | 'edit';

export interface WebSearchForm {
  kind: WebSearchKind | '';
  url: string;
  credential: string;
  maxSearches: number | null;
  results: number | null;
  pricePerSearchUsd: number | null;
}

export type WebSearchFormField = 'kind' | 'url' | 'credential' | 'maxSearches' | 'results' | 'pricePerSearchUsd';

export type WebSearchFormErrors = Partial<Record<WebSearchFormField, string>>;

export type WebSearchFormResult = { ok: true; spec: WebSearchSpec } | { ok: false; errors: WebSearchFormErrors };

const EDITABLE_FIELDS: readonly WebSearchFormField[] = ['kind', 'url', 'credential', 'maxSearches', 'results', 'pricePerSearchUsd'];

const DEFAULT_URLS: Readonly<Record<WebSearchKind, string>> = { brave: BRAVE_URL, mock: MOCK_SEARCH_URL };

type Entry = Record<string, unknown>;

export function emptyWebSearchForm(): WebSearchForm {
  return { kind: 'brave', url: BRAVE_URL, credential: '', maxSearches: STARTING_MAX_SEARCHES, results: STARTING_RESULTS, pricePerSearchUsd: null };
}

export function webSearchFormOf(search: WebSearchSpec): WebSearchForm {
  return {
    kind: search.kind ?? '',
    url: search.url,
    credential: search.credential ?? '',
    maxSearches: search.maxSearches ?? null,
    results: search.results ?? null,
    pricePerSearchUsd: search.pricePerSearchUsd ?? null,
  };
}

/**
 * A mock search never leaves Synapse, so switching to one lets go of the key and switching back restores the one the editor opened with; an address
 * still at the previous kind's default follows the kind.
 */
export function webSearchKindPatch(form: WebSearchForm, kind: WebSearchKind, initial: WebSearchForm): Pick<WebSearchForm, 'kind' | 'url' | 'credential'> {
  const url = form.url.trim();
  const atDefault = url === '' || (form.kind !== '' && url === DEFAULT_URLS[form.kind]);
  const nextUrl = atDefault ? (initial.kind === kind && initial.url !== '' ? initial.url : DEFAULT_URLS[kind]) : form.url;
  if (kind === 'mock') return { kind, url: nextUrl, credential: '' };
  return { kind, url: nextUrl, credential: form.kind === 'mock' ? initial.credential : form.credential };
}

function countError(value: number | null, max: number, missing: string): string | undefined {
  if (value === null) return missing;
  return Number.isInteger(value) && value >= 1 && value <= max ? undefined : `Use a whole number from 1 to ${max}`;
}

function priceError(value: number | null): string | undefined {
  if (value === null) return undefined;
  if (!Number.isFinite(value)) return 'Enter a number';
  return value < 0 ? "A price can't be negative" : undefined;
}

function credentialError(form: WebSearchForm): string | undefined {
  if (form.kind === 'brave' && form.credential === '') return 'Choose the stored API key Brave is called with';
  return form.kind === 'mock' && form.credential !== '' ? 'A test stand-in sends no API key, so remove it' : undefined;
}

export function validateWebSearchForm(form: WebSearchForm): WebSearchFormResult {
  const candidates: Record<WebSearchFormField, string | undefined> = {
    kind: form.kind === '' ? 'Choose a search engine' : undefined,
    url: urlError(form.url),
    credential: credentialError(form),
    maxSearches: countError(form.maxSearches, MAX_SEARCHES, 'Enter how many searches an answer may run'),
    results: countError(form.results, MAX_SEARCH_RESULTS, 'Enter how many results each search returns'),
    pricePerSearchUsd: priceError(form.pricePerSearchUsd),
  };
  const errors = Object.fromEntries(Object.entries(candidates).filter(([, message]) => message !== undefined)) as WebSearchFormErrors;
  if (Object.keys(errors).length > 0 || form.kind === '' || form.maxSearches === null || form.results === null) return { ok: false, errors };
  return {
    ok: true,
    spec: {
      kind: form.kind,
      url: form.url.trim(),
      ...(form.kind === 'brave' && { credential: form.credential }),
      maxSearches: form.maxSearches,
      results: form.results,
      ...(form.pricePerSearchUsd !== null && { pricePerSearchUsd: form.pricePerSearchUsd }),
    },
  };
}

function projection(form: WebSearchForm, field: WebSearchFormField): unknown {
  switch (field) {
    case 'kind':
    case 'credential':
      return form[field] === '' ? undefined : form[field];
    case 'url':
      return form.url.trim();
    case 'maxSearches':
    case 'results':
    case 'pricePerSearchUsd':
      return form[field] ?? undefined;
  }
}

export function editedWebSearchFields(initial: WebSearchForm, form: WebSearchForm): WebSearchFormField[] {
  return EDITABLE_FIELDS.filter(field => !isSameValue(projection(initial, field), projection(form, field)));
}

function withField(entry: Entry, field: string, value: unknown): Entry {
  if (value !== undefined) return { ...entry, [field]: value };
  const { [field]: _removed, ...rest } = entry;
  return rest;
}

function patchEntry(raw: Entry, fields: readonly WebSearchFormField[], spec: WebSearchSpec): Entry {
  return fields.reduce((entry, field) => withField(entry, field, spec[field]), raw);
}

export function addWebSearchEdit(spec: WebSearchSpec): CatalogEdit {
  return compareAndSet(
    document => withWebSearch(document, spec),
    document => rawWebSearch(document) === undefined,
    WEB_SEARCH_ALREADY_SET_UP,
  );
}

/** Re-applied to the live catalog on every attempt: untouched fields keep what is stored now, and an edited field someone else also changed is refused. */
export function updateWebSearchEdit(initial: WebSearchForm, form: WebSearchForm, spec: WebSearchSpec): CatalogEdit {
  const fields = editedWebSearchFields(initial, form);
  const isAsOpened = (document: CatalogDocument): boolean => {
    const stored = readWebSearch(document);
    const current = stored ? webSearchFormOf(stored) : undefined;
    return current !== undefined && fields.every(field => isSameValue(projection(current, field), projection(initial, field)));
  };
  return compareAndSet(document => editWebSearch(document, raw => patchEntry(raw, fields, spec)), isAsOpened, CONCURRENT_WEB_SEARCH_CHANGE);
}

export function removeWebSearchEdit(): CatalogEdit {
  return (document: CatalogDocument): DocumentEdit => withoutWebSearch(document);
}

/** Refused when the stored key differs from the one on screen, so picking never overwrites a choice someone else just saved. */
export function assignWebSearchCredentialEdit(seen: string | undefined, credentialId: string | null): CatalogEdit {
  const isAsOpened = (document: CatalogDocument): boolean => {
    const raw = rawWebSearch(document);
    return isRecord(raw) && text(raw.credential) === seen;
  };
  return compareAndSet(document => withWebSearchCredential(document, credentialId), isAsOpened, CONCURRENT_WEB_SEARCH_KEY_CHANGE);
}
