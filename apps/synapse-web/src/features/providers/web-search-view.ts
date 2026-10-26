import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { rawWebSearch, readWebSearch } from '@/features/catalog/catalog-readers';
import { type WebSearchKind, type WebSearchSpec } from '@/features/catalog/catalog-spec.types';
import { keyStatusOf } from '@/features/credentials/credential-view';
import { type CredentialResponse } from '@/lib/apis/api-types.gen';

import { type ProviderKeyStatus } from './provider-view';

export type WebSearchState = { kind: 'off' } | { kind: 'on'; search: WebSearchSpec } | { kind: 'unreadable' };

const KIND_NAMES: Readonly<Record<WebSearchKind, string>> = { brave: 'Brave Search', mock: 'Test stand-in' };

export const WEB_SEARCH_KIND_DESCRIPTIONS: Readonly<Record<WebSearchKind, string>> = {
  brave: "Brave's Search API, called with a stored API key",
  mock: 'Answers with made-up results without leaving Synapse, for tests',
};

export function webSearchKindName(kind: WebSearchKind | undefined): string {
  return kind ? KIND_NAMES[kind] : 'Not set';
}

export function webSearchState(document: CatalogDocument): WebSearchState {
  const search = readWebSearch(document);
  if (search) return { kind: 'on', search };
  return rawWebSearch(document) === undefined ? { kind: 'off' } : { kind: 'unreadable' };
}

export function webSearchKeyStatus(search: Pick<WebSearchSpec, 'kind' | 'credential'>, credentials?: readonly CredentialResponse[]): ProviderKeyStatus {
  if (search.credential === undefined) return search.kind === 'mock' ? { kind: 'not_needed' } : { kind: 'none' };
  return keyStatusOf({ credential: search.credential }, credentials);
}
