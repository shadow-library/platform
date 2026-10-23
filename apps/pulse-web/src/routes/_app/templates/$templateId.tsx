import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { TemplateDetail } from '@/features/templates';
import { templateQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_app/templates/$templateId')({
  // Only the template is prefetched; the version history stays a client fetch (secondary panel).
  loader: ({ context, params }) => context.queryClient.prefetchQuery(templateQueryOptions(params.templateId)),
  component: TemplateDetailRoute,
});

function TemplateDetailRoute(): ReactElement {
  const { templateId } = Route.useParams();
  return <TemplateDetail templateId={templateId} />;
}
