/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import { PartialList } from '@/features/design';

export const Route = createFileRoute('/_app/design/partials/')({
  component: PartialList,
});
