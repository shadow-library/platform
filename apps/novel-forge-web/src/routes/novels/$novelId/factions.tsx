/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { EntityGrid } from '@/features/entities/EntityGrid';

export const Route = createFileRoute('/novels/$novelId/factions')({
  component: Factions,
});

function Factions() {
  const { novelId } = Route.useParams();
  return <EntityGrid projectId={novelId} type="faction" title="Factions & organizations" subtitle="Who holds power, and who wants it." singular="faction" span={{ xs: 24, sm: 12, lg: 8 }} />;
}
