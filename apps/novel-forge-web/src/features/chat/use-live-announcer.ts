import { useEffect, useRef, useState } from 'react';

import { type ChatJobState, jobSettled } from '@/lib/apis';

import { jobView } from './chat-view';

export interface LiveAnnouncer {
  announcement: string;
  announce: (text: string) => void;
}

export function useLiveAnnouncer(): LiveAnnouncer {
  const [announcement, setAnnouncement] = useState('');
  // The region is emptied before each message so the same words — two turns ending alike — are read out again.
  const announceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announce = (text: string): void => {
    clearTimeout(announceTimer.current);
    setAnnouncement('');
    announceTimer.current = setTimeout(() => setAnnouncement(text), 100);
  };
  useEffect(() => () => clearTimeout(announceTimer.current), []);
  return { announcement, announce };
}

export function useJobAnnouncements(jobs: readonly ChatJobState[], announce: (text: string) => void): void {
  // A job is announced once, when it ends while this chat is open: seen running earlier, or first seen through a live event (seq above 0)
  // because it started and ended between two listings. A job the listing already reports as settled is history, not news.
  const jobStatuses = useRef(new Map<string, string>());
  useEffect(() => {
    for (const job of jobs) {
      const before = jobStatuses.current.get(job.id);
      const endedNow = before === undefined ? job.seq > 0 : !jobSettled(before);
      if (endedNow && jobSettled(job.status)) announce(`${jobView(job).title}.`);
      jobStatuses.current.set(job.id, job.status);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the jobs changing; announce only schedules a timer
  }, [jobs]);
}
