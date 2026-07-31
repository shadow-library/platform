/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import { TemplateList } from '@/features/templates';

export const Route = createFileRoute('/_app/templates/')({
  component: TemplateList,
});
