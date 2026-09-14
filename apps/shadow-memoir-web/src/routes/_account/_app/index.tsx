import { createFileRoute } from '@tanstack/react-router';

import { TodayScreen } from '@/features/today';

export const Route = createFileRoute('/_account/_app/')({ staticData: { title: 'Today' }, component: TodayScreen });
