/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { EntityGrid } from '@/features/entities/EntityGrid';

export const Route = createFileRoute('/novels/$novelId/locations')({
  component: Locations,
});

function Locations() {
  const { novelId } = Route.useParams();
  return <EntityGrid projectId={novelId} type="location" title="Locations" subtitle="Every place the story visits." singular="location" span={{ xs: 24, sm: 12, lg: 8 }} />;
}
