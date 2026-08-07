import { createFileRoute } from '@tanstack/react-router';

import { TemplateList } from '@/features/templates';

export const Route = createFileRoute('/_app/templates/')({
  component: TemplateList,
});
