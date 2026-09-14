import { createFileRoute } from '@tanstack/react-router';

import { AppSyncScreen } from '@/features/settings';

export const Route = createFileRoute('/_account/_app/settings/app')({ component: AppSyncScreen });
