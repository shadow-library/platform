/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import { Dashboard } from '@/features/dashboard';

export const Route = createFileRoute('/_app/')({
  component: Dashboard,
});
