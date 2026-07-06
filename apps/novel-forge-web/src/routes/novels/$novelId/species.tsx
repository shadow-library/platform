/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { EntityGrid } from '@/features/entities/EntityGrid';

export const Route = createFileRoute('/novels/$novelId/species')({
  component: Species,
});

function Species() {
  const { novelId } = Route.useParams();
  return <EntityGrid projectId={novelId} type="concept" title="Species & concepts" subtitle="The peoples, races, and world concepts of the novel." singular="concept" span={{ xs: 12, sm: 8, lg: 8 }} />;
}
