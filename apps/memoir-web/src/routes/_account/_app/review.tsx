import { createFileRoute } from '@tanstack/react-router';

import { WeeklyReviewScreen } from '@/features/review';

export const Route = createFileRoute('/_account/_app/review')({ staticData: { title: 'Weekly Review' }, component: WeeklyReviewScreen });
