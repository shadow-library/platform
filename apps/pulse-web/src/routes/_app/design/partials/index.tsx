/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import { PartialList } from '@/features/design';
import { listPartialsQueryOptions } from '@/lib/apis';

// The partial list is this route's only query and gates the table's loading state, so the loader
// prefetches it — the table renders on the server instead of a spinner.
export const Route = createFileRoute('/_app/design/partials/')({
  loader: ({ context }) => context.queryClient.prefetchQuery(listPartialsQueryOptions()),
  component: PartialList,
});
