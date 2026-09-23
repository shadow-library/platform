import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { GateScreen, keepRefiningStep } from '@/features/blueprint';
import { projectStatusQueryOptions, useProjectQuery, useProjectStatusQuery } from '@/lib/apis';
import { projectTitle } from '@/lib/format';

export const Route = createFileRoute('/novels/$novelId/blueprint/gate')({
  loader: ({ context, params }) => context.queryClient.prefetchQuery(projectStatusQueryOptions(params.novelId)),
  component: GateRoute,
});

function GateRoute(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(novelId);
  const statusQuery = useProjectStatusQuery(novelId);
  const phases = statusQuery.data?.blueprint?.phases ?? [];

  const openStep = (step: string): void => void navigate({ to: '/novels/$novelId/blueprint/$step', params: { novelId, step } });
  const refine = keepRefiningStep(phases);

  return (
    <GateScreen
      projectId={novelId}
      title={projectQuery.data ? projectTitle(projectQuery.data) : 'This novel'}
      phases={phases}
      onOpened={() => void navigate({ to: '/novels/$novelId/overview', params: { novelId } })}
      onRevisit={openStep}
      onKeepRefining={refine == null ? null : () => openStep(refine)}
    />
  );
}
