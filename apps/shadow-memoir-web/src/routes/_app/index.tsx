import { createFileRoute } from '@tanstack/react-router';

import { TodayScreen } from '@/features/today';

export const Route = createFileRoute('/_app/')({ component: TodayScreen });
