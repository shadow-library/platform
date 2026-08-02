/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { WikiEntryScreen } from '@/features/wiki';
import { wikiEntryQueryOptions } from '@/lib/apis';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `ensureQueryData` awaits the fetch in the loader, so a WBN_009 (unknown or still spoiler-locked entry)
 * throws here and is caught by the root `DefaultCatchBoundary` — the same not-found handling `novels.$slug`
 * relies on for an unknown novel slug, kept deliberately generic rather than a bespoke 404 page.
 */
export const Route = createFileRoute('/_shell/novels/$slug_/wiki_/$entryKey')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(wikiEntryQueryOptions(params.slug, params.entryKey)),
  component: WikiEntryScreen,
});
