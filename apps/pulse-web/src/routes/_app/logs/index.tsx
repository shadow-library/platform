import { createFileRoute } from '@tanstack/react-router';

import { MessageLog } from '@/features/logs';

export const Route = createFileRoute('/_app/logs/')({
  component: MessageLog,
});
