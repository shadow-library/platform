import { createFileRoute } from '@tanstack/react-router';

import { RuleList } from '@/features/routing';

export const Route = createFileRoute('/_app/routing/')({
  component: RuleList,
});
