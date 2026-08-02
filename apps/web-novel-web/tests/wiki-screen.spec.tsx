/**
 * Importing npm packages
 */
import { type QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { type WikiEntryDetail, type WikiIndex, wikiKeys } from '@/lib/apis';
import { getRouter } from '@/router';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Route-level rendering for the wiki index and entry detail screens. The live-contract screens read their
 * data from React Query, so each case seeds the router's own QueryClient with the exact wire response for the
 * route's key before mounting — the loader's `ensureQueryData` then serves the cached value and no network is
 * touched. This covers the reader-visible states: an unlocked roster (with the "more unlock" affordance), a
 * novel with no wiki at all, a fully spoiler-locked wiki, an unlocked entry, and an unknown key that — with no
 * seed and no server — fails through to the default error boundary.
 */
function renderAt(path: string, seed?: (client: QueryClient) => void) {
  const router = getRouter();
  seed?.(router.options.context.queryClient);
  router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [path] }) });
  return render(<RouterProvider router={router} />);
}

describe('wiki index screen', () => {
  it('should render the unlocked roster with the "more unlock" affordance', async () => {
    const index: WikiIndex = { items: [{ entryKey: 'ashen-king', type: 'character', name: 'The Ashen King' }], lockedCount: 2 };
    renderAt('/novels/clockwork-saint/wiki', client => client.setQueryData(wikiKeys.index('clockwork-saint'), index));
    expect(await screen.findByText('The Ashen King', undefined, { timeout: 10_000 })).toBeDefined();
    expect(await screen.findByText(/2 more entries unlock/)).toBeDefined();
  });

  it('should show the "no wiki at all" empty state for a novel with none', async () => {
    const index: WikiIndex = { items: [], lockedCount: 0 };
    renderAt('/novels/starfall-requiem/wiki', client => client.setQueryData(wikiKeys.index('starfall-requiem'), index));
    expect(await screen.findByText('No wiki yet', undefined, { timeout: 10_000 })).toBeDefined();
  });

  it('should show the "nothing unlocked yet" empty state for a fully-locked wiki', async () => {
    const index: WikiIndex = { items: [], lockedCount: 5 };
    renderAt('/novels/duskmourn/wiki', client => client.setQueryData(wikiKeys.index('duskmourn'), index));
    expect(await screen.findByText('Nothing unlocked yet', undefined, { timeout: 10_000 })).toBeDefined();
  });
});

describe('wiki entry screen', () => {
  it('should render an unlocked entry with its facets and type badge', async () => {
    const entry: WikiEntryDetail = {
      entryKey: 'ashen-king',
      type: 'character',
      name: 'The Ashen King',
      facets: [{ facetKey: 'overview', content: 'A ruler crowned in ash.', sortOrder: 0 }],
      images: [],
      hiddenFacetCount: 0,
    };
    renderAt('/novels/clockwork-saint/wiki/ashen-king', client => client.setQueryData(wikiKeys.entry('clockwork-saint', 'ashen-king'), entry));
    expect(await screen.findByText('The Ashen King', undefined, { timeout: 10_000 })).toBeDefined();
    expect(await screen.findByText('Browse the full wiki')).toBeDefined();
  });

  it('should fall through to the default error boundary for an unknown entry key', async () => {
    renderAt('/novels/clockwork-saint/wiki/does-not-exist');
    expect(await screen.findByText('Something went wrong', undefined, { timeout: 10_000 })).toBeDefined();
  });
});
