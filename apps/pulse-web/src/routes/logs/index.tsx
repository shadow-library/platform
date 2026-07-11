/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import { MessageLog } from '@/features/logs';

export const Route = createFileRoute('/logs/')({
  component: MessageLog,
});
