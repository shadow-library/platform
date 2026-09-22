import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { NotebookPanel } from '@/features/blueprint';
import styles from '@/features/blueprint/blueprint.module.css';
import { projectStatusQueryOptions } from '@/lib/apis';
import { blueprintStage } from '@/lib/format';

/**
 * The Blueprint frame: the step's own column with the Notebook beside it. The phases live in the app
 * sidebar (the shell swaps its nav while the stage is Blueprint), so this route owns only what sits over
 * the reading column.
 */
export const Route = createFileRoute('/novels/$novelId/blueprint')({
  loader: async ({ context, params }) => {
    const status = await context.queryClient.ensureQueryData(projectStatusQueryOptions(params.novelId));
    if (blueprintStage(status) == null) throw redirect({ to: '/novels/$novelId/overview', params });
  },
  component: BlueprintFrame,
});

function BlueprintFrame(): React.JSX.Element {
  const { novelId } = Route.useParams();

  return (
    <div className={styles.frame}>
      <div className={styles.column}>
        <Outlet />
      </div>
      <NotebookPanel projectId={novelId} className={styles.notebook} />
    </div>
  );
}
