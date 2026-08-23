import { createFileRoute } from '@tanstack/react-router';

import { JournalScreen } from '@/features/quick-logs';

export const Route = createFileRoute('/_app/log/')({ component: JournalScreen });
