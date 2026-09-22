import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Alert } from '@shadow-library/ui';

import { PaneLoader } from '@/components/nf';
import { blueprintAltitude, blueprintStepMeta, blueprintStepScreen, findPhaseOfStep, PhaseHeader, phasePosition, StepPlaceholder } from '@/features/blueprint';
import { type BlueprintPhaseProgressResponse, useBlueprintStateQuery, useProjectStatusQuery } from '@/lib/apis';

export const Route = createFileRoute('/novels/$novelId/blueprint/$step')({
  component: BlueprintStepScreen,
});

const UNKNOWN_PHASE_TITLE = 'That step isn’t part of this Blueprint';
const UNKNOWN_PHASE_BODY = 'It may belong to a novel of a different shape, or it may have been renamed. Pick a phase from the sidebar to carry on.';
const NOT_BUILT_BODY = 'The engine already knows this step; its screen arrives with the next release. Nothing you have decided is affected.';

function BlueprintStepScreen(): React.JSX.Element {
  const { novelId, step: stepKey } = Route.useParams();
  const navigate = useNavigate();
  const statusQuery = useProjectStatusQuery(novelId);
  const stateQuery = useBlueprintStateQuery(novelId);

  const phases: BlueprintPhaseProgressResponse[] = statusQuery.data?.blueprint?.phases ?? [];
  const phase = findPhaseOfStep(phases, stepKey);
  const meta = blueprintStepMeta(stepKey);

  if (statusQuery.isLoading || stateQuery.isLoading) return <PaneLoader />;
  if (statusQuery.error != null || stateQuery.error != null)
    return (
      <Alert intent="danger" title="Couldn’t load the Blueprint">
        {(statusQuery.error ?? stateQuery.error)?.message}
      </Alert>
    );

  if (phase == null) return <StepPlaceholder title={UNKNOWN_PHASE_TITLE} description={UNKNOWN_PHASE_BODY} />;

  const header = (
    <PhaseHeader focusKey={stepKey} phaseNumber={phasePosition(phases, phase.phase)} altitude={blueprintAltitude(phase.phase)} title={meta.title} description={meta.lede} />
  );

  const progress = phase.steps.find(candidate => candidate.key === stepKey);
  const stepState = stateQuery.data?.steps.find(candidate => candidate.key === stepKey);
  const renderScreen = blueprintStepScreen(stepKey);

  if (phase.status === 'locked')
    return (
      <>
        {header}
        <StepPlaceholder locked title={`${phase.label} is still locked`} description={phase.lockReason ?? 'Finish the phase above it first.'} />
      </>
    );

  if (progress?.applies === false)
    return (
      <>
        {header}
        <StepPlaceholder title="This novel doesn’t need this step" description="What you promised the reader rules it out, so it never holds its phase back." />
      </>
    );

  if (renderScreen != null && stepState != null)
    return (
      <>
        {header}
        {renderScreen({ projectId: novelId, step: stepState, onLocked: () => void navigate({ to: '/novels/$novelId/blueprint', params: { novelId } }) })}
      </>
    );

  return (
    <>
      {header}
      <StepPlaceholder title={`${meta.label} is being built`} description={NOT_BUILT_BODY} />
    </>
  );
}
