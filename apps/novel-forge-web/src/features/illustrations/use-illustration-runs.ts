import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@shadow-library/ui';

import {
  type ApiError,
  illustrationKeys,
  type IllustrationResponse,
  illustrationRunsQueryOptions,
  invalidateRuns,
  listIllustrationsQueryOptions,
  type PendingIllustrationStart,
  type StartIllustrationBody,
  useCancelRunMutation,
  useIllustrationRunsQuery,
  usePendingIllustrationStarts,
  useSettledRunRefresh,
  useStartIllustrationMutation,
  type WorkflowRunListItemResponse,
} from '@/lib/apis';
import { newestIllustrationFor, parseRunTarget, runTarget, splitBoardRuns, unclaimedStarts } from '@/lib/illustration-board';

export type IllustrationRun = WorkflowRunListItemResponse;

export interface IllustrationStartEntry extends PendingIllustrationStart {
  target: string;
}

export interface IllustrationRunsView {
  /** Every illustration run the server returned, settled ones included. */
  runs: IllustrationRun[];
  resolved: boolean;
  running: IllustrationRun[];
  failed: IllustrationRun[];
  /** Requests sent whose run the server has not recorded yet. */
  starting: IllustrationStartEntry[];
}

const NOTHING_DISMISSED: ReadonlySet<string> = new Set();
const NO_RUNS: IllustrationRun[] = [];

export function useIllustrationRuns(novelId: string, dismissed: ReadonlySet<string> = NOTHING_DISMISSED): IllustrationRunsView {
  const starts = usePendingIllustrationStarts(novelId);
  const query = useIllustrationRunsQuery(novelId, starts.length > 0);
  const runs = query.data?.items ?? NO_RUNS;
  const entries = starts.map(start => ({ ...start, target: runTarget(start.body.subjectType, start.body.subjectKey) }));
  const { running, failed } = splitBoardRuns(runs, new Set(entries.map(entry => entry.target)), dismissed, query.dataUpdatedAt);

  return { runs, resolved: !query.isLoading, running, failed, starting: unclaimedStarts(entries, running) };
}

/** Sends a start whose dialog has already closed. A rejection that never became a run (bad references, a stale chapter) has no tile, so it comes back to `onRejected`. */
export function useStartIllustration(
  novelId: string,
  onRejected: (error: ApiError, body: StartIllustrationBody) => void,
): (body: StartIllustrationBody, onCreated?: (created: IllustrationResponse) => void) => void {
  const queryClient = useQueryClient();
  const start = useStartIllustrationMutation(novelId, (error, body) => {
    if (error.code?.startsWith('AI_')) return;
    const target = runTarget(body.subjectType, body.subjectKey);
    void queryClient
      .fetchQuery(illustrationRunsQueryOptions(novelId))
      .catch(() => undefined)
      .then(list => {
        if (!list?.items.some(run => run.target === target && run.status === 'running')) onRejected(error, body);
      });
  });

  return (body, onCreated) => {
    start.mutate(body, onCreated ? { onSuccess: onCreated } : undefined);
    toast.info('Rendering in the background', { body: 'Keep working. You will be told when the candidates are ready.' });
  };
}

export interface IllustrationRunStop {
  stop: (runId: string) => void;
  stopping: boolean;
}

export function useStopIllustrationRun(novelId: string): IllustrationRunStop {
  const queryClient = useQueryClient();
  const cancel = useCancelRunMutation(novelId);
  const stop = (runId: string): void => {
    cancel.mutate(runId, {
      onSuccess: ({ outcome }) => {
        invalidateRuns(queryClient, novelId);
        if (outcome === 'stopping') toast.success('Render stopped', { body: 'Nothing was added to the story.' });
        if (outcome === 'not_delivered') toast.warning('Could not reach this render', { body: 'It may still finish on its own.' });
      },
      onError: err => toast.danger(err.message),
    });
  };
  return { stop, stopping: cancel.isPending };
}

/** Watches for runs that settle, wherever the author is by then: the shell mounts this, so a render finishing during a chat turn still announces itself. */
export function useIllustrationRunNotifier(novelId: string): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { run: openRunId } = useSearch({ strict: false }) as { run?: string };
  const { runs } = useIllustrationRuns(novelId);
  const watched = useRef<ReadonlySet<string>>(new Set());
  useSettledRunRefresh(novelId, runs);

  const openResult = useCallback(
    async (run: IllustrationRun): Promise<void> => {
      const list = await queryClient.fetchQuery(listIllustrationsQueryOptions(novelId));
      const created = newestIllustrationFor(list.items, run);
      await navigate({ to: '/novels/$novelId/illustrations', params: { novelId }, search: { illustration: created?.id } });
    },
    [queryClient, navigate, novelId],
  );

  useEffect(() => {
    const settled = runs.filter(run => run.status !== 'running' && watched.current.has(run.id) && parseRunTarget(run.target));
    watched.current = new Set(runs.filter(run => run.status === 'running').map(run => run.id));
    for (const run of settled) {
      if (run.status === 'completed') void queryClient.invalidateQueries({ queryKey: illustrationKeys.all(novelId) });
      if (openRunId === run.id) continue;
      if (run.status === 'completed') toast.success('Candidates ready', { body: 'Pick the one you want to keep.', action: { label: 'View', onClick: () => void openResult(run) } });
      if (run.status === 'failed') {
        toast.danger('Render failed', {
          body: 'Your request is kept, so you can try again.',
          action: { label: 'View', onClick: () => void navigate({ to: '/novels/$novelId/illustrations', params: { novelId }, search: { run: run.id } }) },
        });
      }
    }
  }, [runs, openRunId, queryClient, novelId, navigate, openResult]);
}

function dismissedKey(novelId: string): string {
  return `nf:illustration-runs-dismissed:${novelId}`;
}

function readDismissed(novelId: string): ReadonlySet<string> {
  if (typeof window === 'undefined') return NOTHING_DISMISSED;
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(dismissedKey(novelId)) ?? '[]');
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return NOTHING_DISMISSED;
  }
}

/** Per browser on purpose: a dismissal hides a tile and changes nothing else, and failed runs age out of the list within a week anyway. */
export function useDismissedRuns(novelId: string): { dismissed: ReadonlySet<string>; dismiss: (runId: string) => void } {
  const [dismissed, setDismissed] = useState(() => readDismissed(novelId));
  const [loadedFor, setLoadedFor] = useState(novelId);
  if (loadedFor !== novelId) {
    setLoadedFor(novelId);
    setDismissed(readDismissed(novelId));
  }
  const dismiss = (runId: string): void => {
    const next = new Set(dismissed).add(runId);
    setDismissed(next);
    try {
      window.localStorage.setItem(dismissedKey(novelId), JSON.stringify([...next]));
    } catch {
      return;
    }
  };
  return { dismissed, dismiss };
}
