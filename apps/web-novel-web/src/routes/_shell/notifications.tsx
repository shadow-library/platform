import { createFileRoute } from '@tanstack/react-router';

import { NotificationsScreen } from '@/features/notifications';

/**
 * Updates are device-local and seeded per device, so the screen is public — guests keep their own on-device
 * feed, and a session simply namespaces it. No loader: the localStorage-backed feed hydrates on the client.
 */
export const Route = createFileRoute('/_shell/notifications')({
  component: NotificationsScreen,
});
