import { createFileRoute } from '@tanstack/react-router';

import { NotificationsScreen } from '@/features/notifications';

/** Public: the feed is device-local, so guests keep their own and a session only namespaces it. No loader; it hydrates on the client. */
export const Route = createFileRoute('/_shell/notifications')({
  component: NotificationsScreen,
});
