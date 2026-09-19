import { useState } from 'react';
import { Accordion, Spinner } from '@shadow-library/ui';

import { type ChatTurnLookup } from '@/lib/apis';

import { CheckIcon, WarningIcon } from '../icons';
import styles from './LookupTrace.module.css';

interface LookupTraceProps {
  lookups: ChatTurnLookup[];
  running: boolean;
}

const TRACE_VALUE = 'trace';
const STATUS_LABEL: Record<ChatTurnLookup['status'], string> = { running: 'Running', ok: 'Done', error: 'Failed' };
const ARGS_PREVIEW_LIMIT = 64;

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function uniqueTools(lookups: ChatTurnLookup[]): string[] {
  return [...new Set(lookups.map(lookup => lookup.tool))];
}

function formatArgValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => `${key}: ${formatArgValue(value)}`)
    .join(', ');
}

export function LookupTrace({ lookups, running }: LookupTraceProps): React.JSX.Element | null {
  const [open, setOpen] = useState(running);
  const [wasRunning, setWasRunning] = useState(running);

  if (running !== wasRunning) {
    setWasRunning(running);
    if (!running) setOpen(false);
  }

  if (lookups.length === 0) return null;

  const title = running ? `Reading the novel — ${pluralize(lookups.length, 'lookup')}` : `Read ${pluralize(lookups.length, 'thing')} — ${uniqueTools(lookups).join(', ')}`;

  return (
    <Accordion type="single" collapsible variant="contained" className={styles.root} value={open ? TRACE_VALUE : ''} onValueChange={value => setOpen(value === TRACE_VALUE)}>
      <Accordion.Item value={TRACE_VALUE} title={title} meta={running ? <Spinner size="sm" label="Reading the novel" /> : undefined}>
        <ul className={styles.list}>
          {lookups.map((lookup, index) => (
            <LookupRow key={`${lookup.round}\u0000${lookup.tool}\u0000${index}`} lookup={lookup} />
          ))}
        </ul>
      </Accordion.Item>
    </Accordion>
  );
}

interface LookupRowProps {
  lookup: ChatTurnLookup;
}

function LookupRow({ lookup }: LookupRowProps): React.JSX.Element {
  const args = formatArgs(lookup.args);
  const truncated = args.length > ARGS_PREVIEW_LIMIT;

  return (
    <li className={styles.row} data-status={lookup.status}>
      <span className={styles.statusIcon} aria-hidden="true">
        {lookup.status === 'running' && <span className={styles.spin} />}
        {lookup.status === 'ok' && <CheckIcon size={14} />}
        {lookup.status === 'error' && <WarningIcon size={14} />}
      </span>
      <span className={styles.tool}>{lookup.tool}</span>
      {args && (
        <span className={truncated ? `${styles.args} ${styles.argsTruncated}` : styles.args} title={truncated ? args : undefined}>
          {args}
        </span>
      )}
      <span className={styles.status}>{STATUS_LABEL[lookup.status]}</span>
    </li>
  );
}
