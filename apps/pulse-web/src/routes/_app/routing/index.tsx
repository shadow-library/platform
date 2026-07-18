/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import { RuleList } from '@/features/routing';

export const Route = createFileRoute('/_app/routing/')({
  component: RuleList,
});
