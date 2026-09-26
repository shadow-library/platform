import { useMemo, useState } from 'react';
import { toast } from '@shadow-library/ui';

import {
  type ApiError,
  type ChangeOpItem,
  isApiError,
  type JobEnqueueResponse,
  type ProposalResponse,
  useApplyProposalMutation,
  useDiscardProposalMutation,
  useGenerateMutation,
  useProposalQuery,
  useUpdateProposalMutation,
} from '@/lib/apis';
import { createPlanFlow, findPlanOp, type WriteErrorView, writeErrorView, type WriteOutcome, writeStopNotice } from '@/lib/plan-card';

export interface PlanCardState {
  proposal?: ProposalResponse;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  saving: boolean;
  saveError: ApiError | null;
  onRetrySave: () => void;
  /** From the click on Write until writing starts or fails, covering the wait for the last save. */
  writing: boolean;
  applyError: ApiError | null;
  onClearApplyError: () => void;
  /** The plan was saved but writing did not start. */
  writeFailure: WriteErrorView | null;
  onRetryWrite: () => void;
  discarding: boolean;
  onChange: (changeSet: ChangeOpItem[]) => void;
  onWrite: () => void;
  onDiscard: () => void;
  /** Resolves once the card's last edit is on the server. */
  settled: () => Promise<boolean>;
}

export function usePlanCard(projectId: string, proposalId: string, onWriting?: (job: JobEnqueueResponse) => void): PlanCardState {
  const query = useProposalQuery(projectId, proposalId);
  const update = useUpdateProposalMutation(projectId);
  const apply = useApplyProposalMutation(projectId);
  const generate = useGenerateMutation(projectId);
  const discard = useDiscardProposalMutation(projectId);
  const [writing, setWriting] = useState(false);
  const [writeFailure, setWriteFailure] = useState<WriteErrorView | null>(null);
  const { mutateAsync: send } = update;
  const { mutateAsync: applyCard } = apply;
  const { mutateAsync: startWriting } = generate;

  const flow = useMemo(
    () =>
      createPlanFlow<ChangeOpItem[], JobEnqueueResponse>({
        send: changeSet => send({ proposalId, changeSet }),
        apply: () => applyCard({ proposalId }),
        write: () => startWriting({ limit: 1 }),
      }),
    [proposalId, send, applyCard, startWriting],
  );

  const chapter = query.data ? findPlanOp(query.data)?.op.chapter : undefined;

  const settle = (outcome: WriteOutcome<JobEnqueueResponse>): void => {
    if (outcome.kind === 'apply-failed') void query.refetch();
    if (outcome.kind === 'write-failed') setWriteFailure(isApiError(outcome.error) ? writeErrorView(outcome.error) : { message: 'Something went wrong.', retry: true });
    if (outcome.kind !== 'written') return;
    const stopped = writeStopNotice(outcome.job, chapter);
    setWriteFailure(stopped);
    if (stopped) return;
    toast.success(chapter ? `Writing chapter ${chapter}` : 'Writing the chapter');
    onWriting?.(outcome.job);
  };

  const run = (start: () => Promise<WriteOutcome<JobEnqueueResponse>>): void => {
    if (writing) return;
    setWriting(true);
    setWriteFailure(null);
    void start()
      .then(settle)
      .finally(() => setWriting(false));
  };

  return {
    proposal: query.data,
    loading: query.isLoading,
    error: query.error,
    onRetry: () => void query.refetch(),
    saving: update.isPending,
    saveError: update.error,
    onRetrySave: flow.retrySave,
    writing,
    applyError: apply.error,
    onClearApplyError: apply.reset,
    writeFailure,
    onRetryWrite: () => run(flow.writeAgain),
    discarding: discard.isPending,
    onChange: flow.change,
    onWrite: () => run(flow.applyAndWrite),
    onDiscard: () => void flow.settled().then(() => discard.mutate(proposalId, { onError: err => toast.danger(err.message) })),
    settled: flow.settled,
  };
}
