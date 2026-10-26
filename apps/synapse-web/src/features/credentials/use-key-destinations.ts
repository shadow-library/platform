import { readProviders, readWebSearch } from '@/features/catalog/catalog-readers';
import { useActiveCatalog } from '@/features/catalog/use-active-catalog';
import { useCapabilities } from '@/lib';

import { type KeyDestination, keyDestinations } from './credential-view';

export type KeyDestinationList = { status: 'unavailable' } | { status: 'loading' } | { status: 'ready'; items: KeyDestination[] };

export function useKeyDestinations(): KeyDestinationList {
  const { readCatalog } = useCapabilities();
  const active = useActiveCatalog(readCatalog);
  if (!readCatalog || active.status === 'error') return { status: 'unavailable' };
  if (active.status === 'loading') return { status: 'loading' };
  if (active.status !== 'ready') return { status: 'ready', items: keyDestinations([]) };
  return { status: 'ready', items: keyDestinations(readProviders(active.document), readWebSearch(active.document)) };
}
