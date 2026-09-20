import { type ReactElement, type ReactNode } from 'react';
import { cn } from '@shadow-library/ui';

import styles from './SparkBars.module.css';

export type SparkBarsDomain = 'zero' | 'range' | { min: number; max: number };

export interface SparkBarsProps {
  values: (number | null)[];
  /** Accessible summary of the whole strip — the bars themselves are decorative. */
  label: string;
  height?: number;
  /** Emphasise the final bar, which is nearly always "today". */
  highlightLast?: boolean;
  /** `zero` measures bars from 0; `range` from just below the smallest value, so a 1 kg change is visible; a fixed `{ min, max }` pins both ends (a mood scale). */
  domain?: SparkBarsDomain;
  /** ISO dates parallel to `values`. When given, each bar sits at its date, so uneven gaps between entries read as time. */
  dates?: string[];
  scale?: { top: ReactNode; bottom: ReactNode };
  axis?: { start: ReactNode; middle?: ReactNode; end: ReactNode };
  className?: string;
}

const DAY_MS = 86_400_000;
const MIN_BAR_PERCENT = 4;

function boundsOf(present: number[], domain: SparkBarsDomain): { low: number; high: number } {
  if (typeof domain === 'object') return { low: domain.min, high: domain.max };
  const max = present.length > 0 ? Math.max(...present) : 1;
  if (domain === 'zero') return { low: 0, high: max > 0 ? max : 1 };

  const min = present.length > 0 ? Math.min(...present) : 0;
  const padding = max > min ? (max - min) * 0.25 : Math.max(Math.abs(max) * 0.05, 1);
  return { low: min - padding, high: max };
}

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00.000Z`) / DAY_MS);
}

/**
 * A blank day is a gap, never a zero — PRD §2.6. A null value renders as an empty slot so a missed day
 * cannot read as a day with nothing in it.
 */
export function SparkBars({ values, label, height = 40, highlightLast = false, domain = 'zero', dates, scale, axis, className }: SparkBarsProps): ReactElement {
  const present = values.filter((value): value is number => value !== null);
  const { low, high } = boundsOf(present, domain);
  const firstDay = dates && dates.length > 0 ? dayNumber(dates[0] as string) : 0;
  const spanDays = dates && dates.length > 0 ? dayNumber(dates[dates.length - 1] as string) - firstDay + 1 : 0;

  const heightOf = (value: number | null): string => {
    if (value === null) return '0%';
    const percent = high > low ? ((value - low) * 100) / (high - low) : 100;
    return `${Math.max(Math.min(percent, 100), MIN_BAR_PERCENT)}%`;
  };

  const placementOf = (index: number): { left: string; width: string } | undefined => {
    if (!dates || spanDays === 0) return undefined;
    const offset = dayNumber(dates[index] as string) - firstDay;
    return { left: `${(offset / spanDays) * 100}%`, width: `max(1px, calc(${100 / spanDays}% - 2px))` };
  };

  return (
    <div className={cn(styles.root, className)}>
      <div className={styles.chart}>
        {scale && (
          <div className={styles.scale} style={{ height }} aria-hidden="true">
            <span>{scale.top}</span>
            <span>{scale.bottom}</span>
          </div>
        )}
        <div className={styles.strip} data-placement={dates ? 'dated' : 'even'} style={{ height }} role="img" aria-label={label}>
          {values.map((value, index) => (
            <span
              key={dates?.[index] ?? index}
              className={cn(styles.bar, value === null && styles.blank)}
              style={{
                ...placementOf(index),
                height: heightOf(value),
                opacity: value === null || (highlightLast && index === values.length - 1) ? 1 : 0.45 + (index / values.length) * 0.4,
              }}
            />
          ))}
        </div>
      </div>
      {axis && (
        <div className={styles.axis}>
          <span>{axis.start}</span>
          {axis.middle !== undefined && <span>{axis.middle}</span>}
          <span>{axis.end}</span>
        </div>
      )}
    </div>
  );
}
