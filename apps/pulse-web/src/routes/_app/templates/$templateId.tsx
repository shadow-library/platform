import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { TemplateDetail } from '@/features/templates';
import { templateQueryOptions } from '@/lib/apis';

// The template is the query that gates this screen's loading state, so the loader prefetches it — the
// version history stays a client fetch (secondary panel).
export const Route = createFileRoute('/_app/templates/$templateId')({
  loader: ({ context, params }) => context.queryClient.prefetchQuery(templateQueryOptions(params.templateId)),
  component: TemplateDetailRoute,
});

function TemplateDetailRoute(): ReactElement {
  const { templateId } = Route.useParams();
  return <TemplateDetail templateId={templateId} />;
}
