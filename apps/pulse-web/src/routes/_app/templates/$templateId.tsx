/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

/**
 *  Importing user defined modules
 */
import { TemplateDetail } from '@/features/templates';

export const Route = createFileRoute('/_app/templates/$templateId')({
  component: TemplateDetailRoute,
});

function TemplateDetailRoute(): ReactElement {
  const { templateId } = Route.useParams();
  return <TemplateDetail templateId={templateId} />;
}
