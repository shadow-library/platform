import { createFileRoute } from '@tanstack/react-router';

import { WeeklyReviewScreen } from '@/features/review';

export const Route = createFileRoute('/_app/review')({ component: WeeklyReviewScreen });
