import { readProviders } from '@/features/catalog/catalog-readers';
import { useActiveCatalog, useDraft } from '@/features/catalog/use-active-catalog';
import { useCapabilities } from '@/lib';

import { type KeyDestination, keyDestinations } from './credential-view';

export type KeyDestinationList = { status: 'unavailable' } | { status: 'loading' } | { status: 'ready'; items: KeyDestination[] };

/** Live and draft providers both count: a key is often stored for a provider the draft has just added, or one the draft is about to drop. */
export function useKeyDestinations(): KeyDestinationList {
  const { readCatalog } = useCapabilities();
  const draft = useDraft(readCatalog);
  const active = useActiveCatalog(readCatalog);
  if (!readCatalog) return { status: 'unavailable' };
  if (draft.status === 'loading' || active.status === 'loading') return { status: 'loading' };
  const documents = [draft.status === 'ready' ? draft.draft?.draft.document : undefined, active.status === 'ready' ? active.document : undefined];
  const providers = documents.flatMap(document => (document ? readProviders(document) : []));
  if (providers.length === 0 && (draft.status === 'error' || active.status === 'error')) return { status: 'unavailable' };
  return { status: 'ready', items: keyDestinations(providers) };
}
