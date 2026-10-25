import { type CatalogEdit } from '@/features/catalog/catalog-change';
import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { readProviders } from '@/features/catalog/catalog-readers';
import { assignCredentialEdit, keySnapshotOf } from '@/features/providers/provider-form';
import { providerName } from '@/features/shared/naming';
import { type CredentialResponse } from '@/lib/apis/api-types.gen';

import { isRevoked, originOfUrl } from './credential-view';

/** `created` right after the key was made; `listed` for a row of the credentials table */
export type OfferMoment = 'created' | 'listed';

export interface OfferAccess {
  writeCatalog: boolean;
  writeProviders: boolean;
}

export interface CredentialOffer {
  provider: string;
  name: string;
  edit: CatalogEdit;
}

/**
 * Right after creating a key every provider at its address is offered, since a new key often replaces another; on the list only a key nobody uses yet
 * is offered, and only to providers that don't send a stored key.
 */
export function credentialOffers(
  credential: Pick<CredentialResponse, 'id' | 'allowedOrigin' | 'referencedBy' | 'revokedAt'>,
  document: CatalogDocument | null,
  moment: OfferMoment,
  access: OfferAccess,
): CredentialOffer[] {
  if (!document || !access.writeCatalog || !access.writeProviders || isRevoked(credential)) return [];
  if (moment === 'listed' && credential.referencedBy.length > 0) return [];
  return readProviders(document)
    .filter(provider => provider.kind !== 'ollama' && originOfUrl(provider.url) === credential.allowedOrigin && provider.credential !== credential.id)
    .filter(provider => moment === 'created' || provider.credential === undefined)
    .map(provider => ({ provider: provider.key, name: providerName(provider.key), edit: assignCredentialEdit(provider.key, keySnapshotOf(provider), credential.id) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
