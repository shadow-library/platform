import { ModelRouterService } from '@modules/ai/model-router.service';

type RunCancellation = Pick<ModelRouterService, 'bindRunSignal' | 'releaseRunSignal' | 'abortRun'>;

/**
 * The cancellation bookkeeping `WorkflowRunService` performs on every run, delegated to a real router
 * so a double cannot drift from it. Spread it into a scripted router, or pass it alone as the router
 * wherever the suite stubs its model calls further down — anything else on it still throws.
 */
export function runCancellationStub(): RunCancellation {
  const router = new ModelRouterService({} as never, { getPostgresClient: () => ({}) } as never, {} as never, {} as never);
  return {
    bindRunSignal: runId => router.bindRunSignal(runId),
    releaseRunSignal: runId => router.releaseRunSignal(runId),
    abortRun: runId => router.abortRun(runId),
  };
}
