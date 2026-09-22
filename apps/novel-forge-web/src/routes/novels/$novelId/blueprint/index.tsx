import { createFileRoute, redirect } from '@tanstack/react-router';

import { blueprintEntryStep, StepPlaceholder } from '@/features/blueprint';
import { projectStatusQueryOptions } from '@/lib/apis';
import { flushInvalidations } from '@/lib/apis/batched-invalidation';

/**
 * The Blueprint's own home: it never renders a phase itself, it resolves which step the author is on.
 * The status is fetched rather than read from cache so a lock that just completed a phase cannot bounce
 * the author back into the step they came from.
 */
export const Route = createFileRoute('/novels/$novelId/blueprint/')({
  loader: async ({ context, params }) => {
    // The lock that sent the author here queued its invalidations; running them before the fetch below
    // lets the two join one request instead of the loader's fetch being followed by the batch's.
    flushInvalidations(context.queryClient);
    const status = await context.queryClient.fetchQuery(projectStatusQueryOptions(params.novelId));
    const step = blueprintEntryStep(status.blueprint?.phases ?? []);
    if (step != null) throw redirect({ to: '/novels/$novelId/blueprint/$step', params: { ...params, step } });
  },
  component: NoStepYet,
});

function NoStepYet(): React.JSX.Element {
  return (
    <StepPlaceholder
      title="The next phase is being built"
      description="Everything this novel can decide today is decided. The rest of the Blueprint arrives with the next release — reopen any phase from the sidebar in the meantime."
    />
  );
}
