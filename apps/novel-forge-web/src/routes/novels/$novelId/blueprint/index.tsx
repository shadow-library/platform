import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';

import { blueprintEntry, BlueprintSummary, StepPlaceholder } from '@/features/blueprint';
import { projectStatusQueryOptions, useProjectQuery, useProjectStatusQuery } from '@/lib/apis';
import { flushInvalidations } from '@/lib/apis/batched-invalidation';
import { blueprintStage, projectTitle } from '@/lib/format';

/**
 * The Blueprint's own home. While the stage is Blueprint it never renders a phase itself, it resolves
 * where the author is: the gate once every required step that applies is done, otherwise the step they
 * are on. In the Workspace it is the design itself, read-only, with a way back into any phase.
 * The status is fetched rather than read from cache so a lock that just completed a phase cannot bounce
 * the author back into the step they came from.
 */
export const Route = createFileRoute('/novels/$novelId/blueprint/')({
  loader: async ({ context, params }) => {
    // The lock that sent the author here queued its invalidations; running them before the fetch below
    // lets the two join one request instead of the loader's fetch being followed by the batch's.
    flushInvalidations(context.queryClient);
    const status = await context.queryClient.fetchQuery(projectStatusQueryOptions(params.novelId));
    if (blueprintStage(status) === 'workspace') return;
    const entry = blueprintEntry(status.blueprint?.phases ?? []);
    if (entry.kind === 'gate') throw redirect({ to: '/novels/$novelId/blueprint/gate', params });
    if (entry.kind === 'step') throw redirect({ to: '/novels/$novelId/blueprint/$step', params: { ...params, step: entry.step } });
  },
  component: BlueprintHome,
});

function BlueprintHome(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(novelId);
  const statusQuery = useProjectStatusQuery(novelId);

  const blueprint = statusQuery.data?.blueprint;
  if (blueprint == null || blueprint.stage !== 'workspace')
    return (
      <StepPlaceholder
        title="The next phase is being built"
        description="Everything this novel can decide today is decided. The rest of the Blueprint arrives with the next release — reopen any phase from the sidebar in the meantime."
      />
    );

  return (
    <BlueprintSummary
      projectId={novelId}
      title={projectQuery.data ? projectTitle(projectQuery.data) : 'this novel'}
      blueprint={blueprint}
      onRevisit={step => void navigate({ to: '/novels/$novelId/blueprint/$step', params: { novelId, step } })}
    />
  );
}
