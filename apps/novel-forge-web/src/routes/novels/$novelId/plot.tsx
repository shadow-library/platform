/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { PageHeader } from '@/components/nf';
import { BibleDocEditor } from '@/features/bible/BibleDocEditor';

export const Route = createFileRoute('/novels/$novelId/plot')({
  component: Plot,
});

function Plot() {
  const { novelId } = Route.useParams();
  return (
    <div>
      <PageHeader title="Plot" subtitle="The through-line of the novel — acts, turns, and payoffs — grounded in canon." />
      <BibleDocEditor projectId={novelId} section="plot" slug="overview" placeholder="Three-act structure, beats, and subplots…" />
    </div>
  );
}
