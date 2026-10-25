import { createFileRoute, redirect } from '@tanstack/react-router';

const TAB_DESTINATIONS = { draft: '/advanced', publish: '/changes', versions: '/history' } as const;

type CatalogTab = keyof typeof TAB_DESTINATIONS;

interface CatalogSearch {
  tab: CatalogTab;
}

const isCatalogTab = (value: unknown): value is CatalogTab => typeof value === 'string' && Object.hasOwn(TAB_DESTINATIONS, value);

/** The old single catalog screen, kept as a redirect so bookmarked `?tab=` links land on the screen that replaced each tab. */
export const Route = createFileRoute('/_app/catalog/')({
  validateSearch: (search: Record<string, unknown>): CatalogSearch => ({ tab: isCatalogTab(search.tab) ? search.tab : 'draft' }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: TAB_DESTINATIONS[search.tab] });
  },
});
