import { Popover, Spinner } from '@shadow-library/ui';

import { useListJobsQuery } from '@/lib/apis';

import { BellIcon } from '../icons';
import styles from './JobsTray.module.css';
import { type NovelParams } from './routes';

function isRunning(status: string): boolean {
  return status === 'pending' || status === 'in_progress';
}

export function JobsTray({ novelId }: NovelParams): React.JSX.Element {
  const jobsQuery = useListJobsQuery(novelId ?? '', Boolean(novelId));
  const jobs = jobsQuery.data?.items ?? [];
  const running = jobs.filter(job => isRunning(job.status));

  return (
    <Popover>
      <Popover.Trigger asChild>
        <button className={`nf-ib ${styles.bellBtn}`} aria-label="Background jobs">
          <BellIcon size={17} />
          {running.length > 0 && <span className={styles.bellBadge} />}
        </button>
      </Popover.Trigger>
      <Popover.Content align="end" sideOffset={8} className={styles.jobsPopover}>
        <Popover.Header title="Background jobs" description={running.length > 0 ? `${running.length} active` : 'Nothing running'} />
        <div className={styles.jobsList}>
          {jobs.length === 0 && <div className={styles.jobsEmpty}>No recent jobs.</div>}
          {jobs.slice(0, 12).map(job => (
            <div key={job.id} className={styles.jobRow}>
              {isRunning(job.status) ? <Spinner size="sm" /> : <span className={styles.jobDot} data-failed={job.status === 'failed' || undefined} />}
              <div className={styles.jobBody}>
                <div className={styles.jobTitle}>
                  {job.kind} · {job.target}
                </div>
                <div className={styles.jobStatus}>{job.status}</div>
              </div>
            </div>
          ))}
        </div>
      </Popover.Content>
    </Popover>
  );
}
