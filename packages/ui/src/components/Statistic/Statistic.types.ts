/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type StatisticSize = 'sm' | 'md' | 'lg';

/** Which direction is the good one — declared, never inferred from the delta's sign. */
export type StatisticPositiveIs = 'up' | 'down' | 'neither';

export interface StatisticProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'onClick'> {
  /** The metric name. Rendered as the label and used in the accessible sentence. */
  label: string;
  /** The raw number. Formatting is the component's job — pre-formatted strings are rejected by the type. */
  value: number;
  /** Trailing unit, baseline-tucked (`%`, `ms`, `req/s`). */
  unit?: string;
  /** Value type scale. @default 'md' */
  size?: StatisticSize;
  /** Signed fraction change (`0.12` = +12%). Omit for a static metric with no baseline. */
  delta?: number;
  /** Which direction counts as good. Declare it on every metric with a delta; absent → neutral (no false green). */
  positiveIs?: StatisticPositiveIs;
  /** The baseline caption ("vs last week") — required reading whenever a delta renders. */
  comparison?: string;
  /** `Intl.NumberFormat` options (compact notation, fraction digits, grouping). */
  format?: Intl.NumberFormatOptions;
  /** Formatting locale. @default the runtime default */
  locale?: string;
  /** Makes the whole block a drill-in link. */
  href?: string;
  /** Makes the whole block an activatable target. */
  onClick?: () => void;
  /** Optional trailing mini-visual (sparkline, Progress) reserved at 48×20. Charting stays out of scope. */
  spark?: ReactNode;
  /** Skeleton the value while the label renders immediately. */
  loading?: boolean;
  /** Value unavailable — renders an em dash with a warning affordance instead of a stale number. */
  error?: boolean;
  /** Announce value changes politely — for genuine monitoring surfaces only. @default false */
  announceUpdates?: boolean;
}
