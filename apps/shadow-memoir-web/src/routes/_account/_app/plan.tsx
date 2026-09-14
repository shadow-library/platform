import { createFileRoute } from '@tanstack/react-router';

import { PlanningBoardScreen } from '@/features/planning';

export const Route = createFileRoute('/_account/_app/plan')({ component: PlanningBoardScreen });
