/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import { LayoutList } from '@/features/design';

export const Route = createFileRoute('/_app/design/layouts/')({
  component: LayoutList,
});
