import { type CatalogEdit } from '@/features/catalog/catalog-change';
import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { readProviders, readWebSearch } from '@/features/catalog/catalog-readers';
import { assignCredentialEdit, keySnapshotOf } from '@/features/providers/provider-form';
import { assignWebSearchCredentialEdit } from '@/features/providers/web-search-form';
import { providerName } from '@/features/shared/naming';
import { type CredentialResponse } from '@/lib/apis/api-types.gen';

import { holderName, isRevoked, originOfUrl, WEB_SEARCH_HOLDER } from './credential-view';

/** `created` right after the key was made; `listed` for a row of the credentials table */
export type OfferMoment = 'created' | 'listed';

export interface OfferAccess {
  writeCatalog: boolean;
  writeProviders: boolean;
}

export interface CredentialOffer {
  /** A provider key, or `WEB_SEARCH_HOLDER` */
  holder: string;
  name: string;
  edit: CatalogEdit;
}

function webSearchOffer(credential: Pick<CredentialResponse, 'id' | 'allowedOrigin'>, document: CatalogDocument, moment: OfferMoment): CredentialOffer[] {
  const search = readWebSearch(document);
  if (!search || search.kind === 'mock' || originOfUrl(search.url) !== credential.allowedOrigin || search.credential === credential.id) return [];
  if (moment === 'listed' && search.credential !== undefined) return [];
  return [{ holder: WEB_SEARCH_HOLDER, name: holderName(WEB_SEARCH_HOLDER), edit: assignWebSearchCredentialEdit(search.credential, credential.id) }];
}

/**
 * Right after creating a key every provider at its address, and the web search there, is offered, since a new key often replaces another; on the
 * list only a key nobody uses yet is offered, and only to those that don't send a stored key.
 */
export function credentialOffers(
  credential: Pick<CredentialResponse, 'id' | 'allowedOrigin' | 'referencedBy' | 'revokedAt'>,
  document: CatalogDocument | null,
  moment: OfferMoment,
  access: OfferAccess,
): CredentialOffer[] {
  if (!document || !access.writeCatalog || !access.writeProviders || isRevoked(credential)) return [];
  if (moment === 'listed' && credential.referencedBy.length > 0) return [];
  const providers = readProviders(document)
    .filter(provider => provider.kind !== 'ollama' && originOfUrl(provider.url) === credential.allowedOrigin && provider.credential !== credential.id)
    .filter(provider => moment === 'created' || provider.credential === undefined)
    .map(provider => ({ holder: provider.key, name: providerName(provider.key), edit: assignCredentialEdit(provider.key, keySnapshotOf(provider), credential.id) }));
  return [...providers, ...webSearchOffer(credential, document, moment)].sort((left, right) => left.name.localeCompare(right.name));
}
