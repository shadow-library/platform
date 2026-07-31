/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import { ProfileList } from '@/features/senders';

export const Route = createFileRoute('/_app/senders/')({
  component: ProfileList,
});
