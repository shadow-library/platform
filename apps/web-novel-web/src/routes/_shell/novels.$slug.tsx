/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { NovelScreen } from '@/features/novel';
import { novelQueryOptions } from '@/lib/apis';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
export const Route = createFileRoute('/_shell/novels/$slug')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(novelQueryOptions(params.slug)),
  component: NovelScreen,
});
