import { Link } from '@tanstack/react-router';
import { Button, CheckIcon, Skeleton } from '@shadow-library/ui';

import { SectionCard } from '@/components/si';

import { type Checklist, type ChecklistRow, type ChecklistStatus } from './overview-model';

import styles from './org-overview.module.css';

interface SecurityChecklistProps {
  orgId: string;
  checklist: Checklist;
}

const STATUS_LABEL: Record<ChecklistStatus, string> = { loading: 'Loading', unknown: 'Status unavailable', todo: 'Not done', done: 'Done' };

function Indicator({ status }: { status: ChecklistStatus }): React.JSX.Element {
  return (
    <span className={styles.indicator} data-status={status} role="img" aria-label={STATUS_LABEL[status]}>
      {status === 'done' && <CheckIcon size={14} />}
      {status === 'loading' && <Skeleton shape="circle" width="1.5rem" />}
    </span>
  );
}

function Step({ orgId, step }: { orgId: string; step: ChecklistRow }): React.JSX.Element {
  const todo = step.status === 'todo';
  const label = todo ? 'Set up' : 'View';
  return (
    <li className={styles.step} aria-busy={step.status === 'loading' || undefined}>
      <Indicator status={step.status} />
      <div className={styles.stepMain}>
        <div className={styles.stepTitle}>{step.title}</div>
        <div className={styles.stepDetail}>{step.status === 'loading' ? <Skeleton className={styles.detailSkeleton} shape="rect" /> : step.detail}</div>
      </div>
      <div className={styles.stepAction}>
        <Button variant={todo ? 'secondary' : 'ghost'} size="sm" asChild>
          <Link to={step.to} params={{ orgId }} aria-label={`${label}: ${step.title}`}>
            {label}
          </Link>
        </Button>
      </div>
    </li>
  );
}

export function SecurityChecklist({ orgId, checklist }: SecurityChecklistProps): React.JSX.Element {
  return (
    <SectionCard title="Secure your organization" description={checklist.summary ?? 'Checking your setup…'}>
      <ul className={styles.checklist}>
        {checklist.rows.map(step => (
          <Step key={step.key} orgId={orgId} step={step} />
        ))}
      </ul>
    </SectionCard>
  );
}
