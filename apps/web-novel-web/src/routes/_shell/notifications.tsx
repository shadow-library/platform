/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { NotificationsScreen } from '@/features/notifications';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Updates are device-local and seeded per device, so the screen is public — guests keep their own on-device
 * feed, and a session simply namespaces it. No loader: the localStorage-backed feed hydrates on the client.
 */
export const Route = createFileRoute('/_shell/notifications')({
  component: NotificationsScreen,
});
