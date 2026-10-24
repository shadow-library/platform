import { createFileRoute, redirect } from '@tanstack/react-router';

import { type CatalogTab, parseCatalogTab } from '@/features/catalog';

interface CatalogSearch {
  tab: CatalogTab;
}

const TAB_DESTINATIONS = { draft: '/advanced', publish: '/changes', versions: '/history' } as const satisfies Record<CatalogTab, string>;

/** The old single catalog screen, kept as a redirect so bookmarked `?tab=` links land on the screen that replaced each tab. */
export const Route = createFileRoute('/_app/catalog/')({
  validateSearch: (search: Record<string, unknown>): CatalogSearch => ({ tab: parseCatalogTab(search.tab) }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: TAB_DESTINATIONS[search.tab] });
  },
});
