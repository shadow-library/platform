import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from '@shadow-library/ui';

import { type GenerationJobItem, hasActiveJob, useJobStop, useListJobsQuery } from '@/lib/apis';
import { activeGenerateJob, type GenerationActivity, generationActivityOf, isRunningJob, jobChapters } from '@/lib/generation-activity';

export interface GenerationActivityState {
  activity?: GenerationActivity;
  stop: () => void;
  stopping: boolean;
}

// Module-level so a job is announced once per tab, not once per screen that happened to be watching it.
const announced = new Set<string>();

function announce(job: GenerationJobItem): void {
  if (announced.has(job.id)) return;
  announced.add(job.id);
  const chapters = jobChapters(job.target);
  const progress = (job.progress ?? {}) as { phase?: unknown; current?: unknown };
  if (job.status === 'failed') return void toast.danger(job.lastError ?? 'Generation failed');
  if (job.status === 'cancelled') return void toast.warning('Generation stopped — chapters that finished before the stop were kept');
  if (progress.phase === 'awaiting_review') return void toast.warning(`Chapter ${String(progress.current)} needs your review — the batch paused there`);
  toast.success(`Chapter${chapters.length > 1 ? 's' : ''} ${chapters.join(', ')} drafted`);
}

export function useGenerationActivity(novelId: string): GenerationActivityState {
  const queryClient = useQueryClient();
  const jobStop = useJobStop(novelId);
  const jobsQuery = useListJobsQuery(novelId, true, { refetchInterval: query => (hasActiveJob(query.state.data) ? 2500 : false) });
  const jobs = jobsQuery.data?.items;
  const activity = generationActivityOf(activeGenerateJob(jobs));
  const watchedRef = useRef<string | undefined>(undefined);
  const activeJobId = activity?.jobId;
  const current = activity?.current;

  // Each new chapter starting means the previous one just landed.
  useEffect(() => {
    if (activeJobId) queryClient.invalidateQueries({ queryKey: ['projects', novelId, 'drafts'] });
  }, [activeJobId, current, novelId, queryClient]);

  useEffect(() => {
    if (activeJobId) {
      watchedRef.current = activeJobId;
      return;
    }
    const finished = jobs?.find(job => job.id === watchedRef.current);
    if (!finished || isRunningJob(finished)) return;
    watchedRef.current = undefined;
    queryClient.invalidateQueries({ queryKey: ['projects', novelId, 'drafts'] });
    queryClient.invalidateQueries({ queryKey: ['projects', novelId, 'runs'] });
    announce(finished);
  }, [activeJobId, jobs, novelId, queryClient]);

  return { activity, stop: () => activeJobId && jobStop.stop(activeJobId), stopping: jobStop.stopping };
}
