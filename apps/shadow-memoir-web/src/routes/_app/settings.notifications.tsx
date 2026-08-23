import { createFileRoute } from '@tanstack/react-router';

import { NotificationSettingsScreen } from '@/features/settings';

export const Route = createFileRoute('/_app/settings/notifications')({ component: NotificationSettingsScreen });
