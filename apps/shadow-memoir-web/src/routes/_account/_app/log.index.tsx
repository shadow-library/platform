import { createFileRoute } from '@tanstack/react-router';

import { JournalScreen } from '@/features/quick-logs';

export const Route = createFileRoute('/_account/_app/log/')({ staticData: { title: 'Journal' }, component: JournalScreen });
