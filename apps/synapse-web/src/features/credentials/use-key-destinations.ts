import { readProviders } from '@/features/catalog/catalog-readers';
import { useActiveCatalog } from '@/features/catalog/use-active-catalog';
import { useCapabilities } from '@/lib';

import { type KeyDestination, keyDestinations } from './credential-view';

export type KeyDestinationList = { status: 'unavailable' } | { status: 'loading' } | { status: 'ready'; items: KeyDestination[] };

export function useKeyDestinations(): KeyDestinationList {
  const { readCatalog } = useCapabilities();
  const active = useActiveCatalog(readCatalog);
  if (!readCatalog || active.status === 'error') return { status: 'unavailable' };
  if (active.status === 'loading') return { status: 'loading' };
  return { status: 'ready', items: keyDestinations(active.status === 'ready' ? readProviders(active.document) : []) };
}
