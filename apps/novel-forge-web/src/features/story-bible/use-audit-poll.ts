import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from '@shadow-library/ui';

import { hasActiveJob, invalidateAudits, type ListGenerationJobResponse, seedAuditReport, useListAuditsQuery, useListJobsQuery } from '@/lib/apis';
import { auditPollState, findAdoptableAuditJob, findAuditJob, type StartedAudit } from '@/lib/bible-audit';

export type { StartedAudit } from '@/lib/bible-audit';

// Once the job is `done` and the audits list has refetched this many times with still no matching report,
// the report isn't coming through this list; polling forever would never say so.
const DONE_NO_REPORT_LIMIT = 5;

interface DoneStreak {
  jobId: string;
  lastUpdatedAt: number;
  count: number;
}

export function useAuditPoll(novelId: string, started: StartedAudit | undefined, onReport: (reportId: string) => void, onFailure: () => void): boolean {
  const queryClient = useQueryClient();
  const jobsQuery = useListJobsQuery(novelId, true, { refetchInterval: query => (hasActiveJob(query.state.data) ? 2500 : false) });

  const [consideredJobs, setConsideredJobs] = useState<ListGenerationJobResponse | undefined>(undefined);
  const [adopted, setAdopted] = useState<StartedAudit | undefined>(undefined);
  // Adjusted during render, not in an effect (refs can't be read during render either, so the "already
  // considered" marker is state too): adopting an in-flight audit this screen didn't start only needs to
  // happen once per newly-seen job list, and only once this screen's own fetch has landed — a cached
  // snapshot from before that (e.g. a stale job left over from an earlier visit) must not be adopted.
  if (started && adopted) setAdopted(undefined);
  if (!started && !adopted && jobsQuery.isFetchedAfterMount && jobsQuery.data !== consideredJobs) {
    setConsideredJobs(jobsQuery.data);
    const job = findAdoptableAuditJob(jobsQuery.data?.items);
    if (job) setAdopted({ jobId: job.id, runId: null, since: job.createdAt });
  }

  const tracked = started ?? adopted;
  const auditsQuery = useListAuditsQuery(novelId, Boolean(tracked), { refetchInterval: () => (tracked ? 2000 : false) });
  const state = auditPollState(jobsQuery.data?.items, auditsQuery.data, tracked);
  const trackedJob = tracked ? findAuditJob(jobsQuery.data?.items, tracked.jobId) : undefined;
  const doneNoReport = Boolean(tracked) && !state.report && trackedJob?.status === 'done';

  const [doneStreak, setDoneStreak] = useState<DoneStreak | undefined>(undefined);
  if (!doneNoReport || !tracked) {
    if (doneStreak) setDoneStreak(undefined);
  } else if (doneStreak?.jobId !== tracked.jobId) {
    setDoneStreak({ jobId: tracked.jobId, lastUpdatedAt: auditsQuery.dataUpdatedAt, count: 1 });
  } else if (doneStreak.lastUpdatedAt !== auditsQuery.dataUpdatedAt) {
    setDoneStreak({ jobId: tracked.jobId, lastUpdatedAt: auditsQuery.dataUpdatedAt, count: doneStreak.count + 1 });
  }
  const stuck = doneNoReport && (doneStreak?.count ?? 0) >= DONE_NO_REPORT_LIMIT;

  const invalidatedJobId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!tracked) return;
    if (doneNoReport && invalidatedJobId.current !== tracked.jobId) {
      invalidatedJobId.current = tracked.jobId;
      invalidateAudits(queryClient, novelId);
    }
  }, [tracked, doneNoReport, novelId, queryClient]);

  const settledJobId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!tracked || (state.running && !stuck) || settledJobId.current === tracked.jobId) return;
    settledJobId.current = tracked.jobId;
    if (stuck) {
      toast.warning('The audit finished — open it from history');
      onFailure();
    } else if (state.report) {
      seedAuditReport(queryClient, novelId, state.report);
      onReport(state.report.id);
    } else if (state.failure) {
      toast.danger(state.failure);
      onFailure();
    }
    setAdopted(undefined);
  }, [tracked, state, stuck, novelId, queryClient, onReport, onFailure]);

  return state.running && !stuck;
}
