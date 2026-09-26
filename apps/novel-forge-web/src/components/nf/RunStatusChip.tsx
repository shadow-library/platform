import { type ReactElement } from 'react';
import { Spinner } from '@shadow-library/ui';

import { type ChipIntent, StatusChip } from './StatusChip';

const RUN_INTENT: Record<string, ChipIntent> = {
  running: 'info',
  completed: 'success',
  awaiting_review: 'warning',
  failed: 'danger',
  cancelled: 'neutral',
};

const RUN_STATUS_LABEL: Record<string, string> = {
  running: 'Running',
  completed: 'Completed',
  awaiting_review: 'Awaiting review',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function runIntent(status: string): ChipIntent {
  return RUN_INTENT[status] ?? 'neutral';
}

export interface RunStatusChipProps {
  status: string;
  /** Author-facing wording ("Awaiting review") instead of the raw status the admin view shows. */
  friendly?: boolean;
}

export function RunStatusChip({ status, friendly = false }: RunStatusChipProps): ReactElement {
  return (
    <StatusChip intent={runIntent(status)} dot={status !== 'running'}>
      {status === 'running' && <Spinner size="sm" />}
      {friendly ? (RUN_STATUS_LABEL[status] ?? status) : status}
    </StatusChip>
  );
}
