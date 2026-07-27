/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { HomeScreen } from '@/features/home';
import { catalogQueryOptions } from '@/lib/apis';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
export const Route = createFileRoute('/_shell/')({
  loader: ({ context }) => {
    // Seed the two home rows server-side; failures fall through to client fetch + cached data.
    void context.queryClient.prefetchQuery(catalogQueryOptions({ sort: 'trending', limit: 12 }));
    void context.queryClient.prefetchQuery(catalogQueryOptions({ sort: 'updated', limit: 6 }));
  },
  component: HomeScreen,
});
