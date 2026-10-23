import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type StatisticSize = 'sm' | 'md' | 'lg';

export type StatisticPositiveIs = 'up' | 'down' | 'neither';

export interface StatisticProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'onClick'> {
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
  comparison?: string;
  format?: Intl.NumberFormatOptions;
  /** Formatting locale. Pinned to a stable default so SSR and client render identical text. @default 'en-US' */
  locale?: string;
  href?: string;
  onClick?: () => void;
  /** Optional trailing mini-visual (sparkline, Progress) reserved at 48×20. Charting stays out of scope. */
  spark?: ReactNode;
  loading?: boolean;
  error?: boolean;
  /** Announce value changes politely — for genuine monitoring surfaces only. @default false */
  announceUpdates?: boolean;
}
