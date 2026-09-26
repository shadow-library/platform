import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from '@shadow-library/ui';

import { hasActiveJob, invalidateChapterReviews, type ListChapterReviewsResponse, useListJobsQuery } from '@/lib/apis';
import { reviewJobState, type ReviewJobState, reviewSettledNotice } from '@/lib/chapter-checks';

export function useReviewJobs(novelId: string, chapter: number, list: ListChapterReviewsResponse | undefined): ReviewJobState {
  const queryClient = useQueryClient();
  const jobsQuery = useListJobsQuery(novelId, true, { refetchInterval: query => (hasActiveJob(query.state.data) ? 2500 : false) });
  const jobs = jobsQuery.data?.items;
  const state = reviewJobState(jobs, chapter, list);
  const activeKey = state.activeIds.join(',');
  const watched = useRef<string[]>([]);

  useEffect(() => {
    const active = activeKey ? activeKey.split(',') : [];
    const settled = watched.current.filter(id => !active.includes(id));
    watched.current = active;
    if (settled.length === 0) return;
    invalidateChapterReviews(queryClient, novelId);
    for (const id of settled) {
      const job = jobs?.find(item => item.id === id);
      const notice = job && reviewSettledNotice(job, chapter);
      if (notice) toast[notice.intent](notice.message);
    }
  }, [activeKey, chapter, jobs, novelId, queryClient]);

  return state;
}
