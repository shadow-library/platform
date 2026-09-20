import { IconButton, Popover, Spinner, Tooltip } from '@shadow-library/ui';

import { type GenerationJobItem, useJobStop, useListJobsQuery } from '@/lib/apis';

import { BellIcon, StopIcon } from '../icons';
import styles from './JobsTray.module.css';
import { type NovelParams } from './routes';

function isRunning(status: string): boolean {
  return status === 'pending' || status === 'in_progress';
}

interface JobRowProps {
  novelId: string;
  job: GenerationJobItem;
}

function JobRow({ novelId, job }: JobRowProps): React.JSX.Element {
  const jobStop = useJobStop(novelId);
  const running = isRunning(job.status);
  return (
    <div className={styles.jobRow}>
      {running ? (
        <Spinner size="sm" />
      ) : (
        <span className={styles.jobDot} data-failed={job.status === 'failed' || undefined} data-cancelled={job.status === 'cancelled' || undefined} />
      )}
      <div className={styles.jobBody}>
        <div className={styles.jobTitle}>
          {job.kind} · {job.target}
        </div>
        <div className={styles.jobStatus}>{job.status === 'cancelled' ? 'stopped' : job.status}</div>
      </div>
      {running && (
        <Tooltip content="Stop">
          <IconButton size="sm" variant="ghost" aria-label="Stop job" icon={<StopIcon size={13} />} loading={jobStop.stopping} onClick={() => jobStop.stop(job.id)} />
        </Tooltip>
      )}
    </div>
  );
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
          {novelId && jobs.slice(0, 12).map(job => <JobRow key={job.id} novelId={novelId} job={job} />)}
        </div>
      </Popover.Content>
    </Popover>
  );
}
