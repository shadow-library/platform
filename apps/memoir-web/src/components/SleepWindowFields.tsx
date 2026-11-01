import { type ReactElement } from 'react';
import { cn, FormField, MoonIcon, TimePicker } from '@shadow-library/ui';

import { formatDuration, sleepMinutesBetween } from '@/lib/data';

import styles from './SleepWindowFields.module.css';

export interface SleepWindowFieldsProps {
  wakeTime: string;
  sleepTime: string;
  onWakeTimeChange: (value: string) => void;
  onSleepTimeChange: (value: string) => void;
  problem?: string | null;
  wakeHelper?: string;
  sleepHelper?: string;
  disabled?: boolean;
  /** Bumping a key remounts that picker, discarding text the person typed but the caller rejected. */
  wakeKey?: number;
  sleepKey?: number;
  className?: string;
}

export function SleepWindowFields(props: SleepWindowFieldsProps): ReactElement {
  const { wakeTime, sleepTime, onWakeTimeChange, onSleepTimeChange, problem, wakeHelper, sleepHelper, disabled, wakeKey, sleepKey, className } = props;
  const sleep = sleepMinutesBetween(wakeTime, sleepTime);
  const invalid = problem != null;

  return (
    <div className={cn(styles.window, className)}>
      <div className={styles.row}>
        <FormField label="Sleep time" helper={sleepHelper} invalid={invalid} disabled={disabled}>
          <TimePicker
            key={sleepKey}
            value={sleepTime}
            onValueChange={value => {
              if (value) onSleepTimeChange(value);
            }}
            hour12={false}
            fullWidth
            disabled={disabled}
          />
        </FormField>
        <div className={styles.bridge} data-invalid={invalid || undefined}>
          <span className={styles.bridgeLabel} aria-hidden="true" />
          <span className={styles.bridgeValue} aria-live="polite">
            <MoonIcon size={14} />
            {sleep === 0 ? 'No sleep' : `${formatDuration(sleep)} sleep`}
          </span>
        </div>
        <FormField label="Wake time" helper={wakeHelper} invalid={invalid} disabled={disabled}>
          <TimePicker
            key={wakeKey}
            value={wakeTime}
            onValueChange={value => {
              if (value) onWakeTimeChange(value);
            }}
            hour12={false}
            fullWidth
            disabled={disabled}
          />
        </FormField>
      </div>
      {invalid ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
