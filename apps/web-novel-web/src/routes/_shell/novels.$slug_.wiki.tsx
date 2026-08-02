/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { WikiIndexScreen } from '@/features/wiki';
import { novelQueryOptions, wikiIndexQueryOptions } from '@/lib/apis';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
export const Route = createFileRoute('/_shell/novels/$slug_/wiki')({
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(novelQueryOptions(params.slug));
    return context.queryClient.ensureQueryData(wikiIndexQueryOptions(params.slug));
  },
  component: WikiIndexScreen,
});
