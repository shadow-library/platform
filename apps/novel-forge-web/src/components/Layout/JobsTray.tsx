import { Link } from '@tanstack/react-router';
import { BellIcon, IconButton, Popover, Spinner, Tooltip } from '@shadow-library/ui';

import { type IllustrationRun, useIllustrationRunNotifier, useIllustrationRuns, useStopIllustrationRun } from '@/features/illustrations/use-illustration-runs';
import { type GenerationJobItem, useJobStop, useListEntitiesQuery, useListJobsQuery, useRunUsageQuery } from '@/lib/apis';
import { formatElapsed, parseRunTarget, runStageLabel, runStageOf, subjectLabel } from '@/lib/illustration-board';
import { useElapsedSeconds } from '@/lib/use-elapsed-seconds';

import { StopIcon } from '../icons';
import rowStyles from './IllustrationRunRow.module.css';
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

interface IllustrationRunRowProps {
  novelId: string;
  run: IllustrationRun;
  entityNames: ReadonlyMap<string, string>;
}

function IllustrationRunRow({ novelId, run, entityNames }: IllustrationRunRowProps): React.JSX.Element {
  const usage = useRunUsageQuery(novelId, run.id, true);
  const elapsed = useElapsedSeconds(Date.parse(run.startedAt));
  const { stop, stopping } = useStopIllustrationRun(novelId);
  const subject = parseRunTarget(run.target);
  return (
    <div className={styles.jobRow}>
      <Spinner size="sm" />
      <Link to="/novels/$novelId/illustrations" params={{ novelId }} search={{ run: run.id }} className={rowStyles.link}>
        <div className={rowStyles.name}>Illustration · {subject ? subjectLabel(subject, entityNames) : run.target}</div>
        <div className={styles.jobStatus}>
          {runStageLabel(runStageOf(usage.data?.calls))} · {formatElapsed(elapsed)}
        </div>
      </Link>
      <Tooltip content="Stop">
        <IconButton size="sm" variant="ghost" aria-label="Stop render" icon={<StopIcon size={13} />} loading={stopping} onClick={() => stop(run.id)} />
      </Tooltip>
    </div>
  );
}

function IllustrationRunNotifier({ novelId }: { novelId: string }): null {
  useIllustrationRunNotifier(novelId);
  return null;
}

function RunningIllustrations({ novelId }: { novelId: string }): React.JSX.Element {
  const { running } = useIllustrationRuns(novelId);
  const entitiesQuery = useListEntitiesQuery(novelId, { limit: 500 }, running.length > 0);
  const entityNames = new Map((entitiesQuery.data?.items ?? []).map(entity => [entity.entityKey, entity.name]));
  return (
    <>
      {running.map(run => (
        <IllustrationRunRow key={run.id} novelId={novelId} run={run} entityNames={entityNames} />
      ))}
    </>
  );
}

export function JobsTray({ novelId }: NovelParams): React.JSX.Element {
  const jobsQuery = useListJobsQuery(novelId ?? '', Boolean(novelId));
  const jobs = jobsQuery.data?.items ?? [];
  const illustrations = useIllustrationRuns(novelId ?? '');
  const running = [...jobs.filter(job => isRunning(job.status)).map(job => job.id), ...illustrations.running.map(run => run.id)];
  const hasWork = jobs.length > 0 || illustrations.running.length > 0;

  return (
    <Popover>
      {novelId && <IllustrationRunNotifier novelId={novelId} />}
      <Popover.Trigger asChild>
        <button className={`nf-ib ${styles.bellBtn}`} aria-label="Background jobs">
          <BellIcon size={17} />
          {running.length > 0 && <span className={styles.bellBadge} />}
        </button>
      </Popover.Trigger>
      <Popover.Content align="end" sideOffset={8} className={styles.jobsPopover}>
        <Popover.Header title="Background jobs" description={running.length > 0 ? `${running.length} active` : 'Nothing running'} />
        <div className={styles.jobsList}>
          {!hasWork && <div className={styles.jobsEmpty}>No recent jobs.</div>}
          {novelId && <RunningIllustrations novelId={novelId} />}
          {novelId && jobs.slice(0, 12).map(job => <JobRow key={job.id} novelId={novelId} job={job} />)}
        </div>
      </Popover.Content>
    </Popover>
  );
}
