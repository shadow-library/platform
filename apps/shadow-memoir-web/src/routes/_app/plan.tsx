import { createFileRoute } from '@tanstack/react-router';

import { PlanningBoardScreen } from '@/features/planning';

export const Route = createFileRoute('/_app/plan')({ component: PlanningBoardScreen });
