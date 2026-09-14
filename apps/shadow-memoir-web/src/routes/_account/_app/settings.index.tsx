import { createFileRoute } from '@tanstack/react-router';

import { SettingsScreen } from '@/features/settings';

export const Route = createFileRoute('/_account/_app/settings/')({ component: SettingsScreen });
