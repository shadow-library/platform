import { createFileRoute } from '@tanstack/react-router';

import { SideQuestsScreen } from '@/features/quick-logs';

export const Route = createFileRoute('/_app/log/sidequests')({ component: SideQuestsScreen });
