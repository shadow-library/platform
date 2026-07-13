/**
 * Importing npm packages
 */
import { type ElementType, forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn, DEFAULT_LOCALE } from '@/lib';

import { Skeleton } from '../Skeleton';
import styles from './Statistic.module.css';
import { type StatisticPositiveIs, type StatisticProps } from './Statistic.types';

/**
 * Declaring the constants
 */
type Sentiment = 'good' | 'bad' | 'neutral';

function sentimentOf(delta: number, positiveIs: StatisticPositiveIs): Sentiment {
  if (delta === 0 || positiveIs === 'neither') return 'neutral';
  const good = (positiveIs === 'up' && delta > 0) || (positiveIs === 'down' && delta < 0);
  return good ? 'good' : 'bad';
}

function DeltaArrow({ direction }: { direction: -1 | 0 | 1 }) {
  if (direction === 0)
    return (
      <svg viewBox='0 0 12 12' width='11' height='11' fill='none' stroke='currentColor' strokeWidth={1.75} strokeLinecap='round' aria-hidden='true'>
        <path d='M2.5 6h7' />
      </svg>
    );
  return (
    <svg
      viewBox='0 0 12 12'
      width='11'
      height='11'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.75}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      data-direction={direction}
    >
      <path d={direction > 0 ? 'M6 9.5V2.5M3 5.5 6 2.5l3 3' : 'M6 2.5v7M3 6.5 6 9.5l3-3'} />
    </svg>
  );
}

/**
 * One metric: label, value, and an honest delta. The primitive that KPI rows and dashboard headers
 * compose from — sentiment is declared (`positiveIs`), never inferred from the arrow's direction, so a
 * rising churn number can never render green. The value is always a raw number formatted through
 * `Intl.NumberFormat`; it is the tile content, not the tile — place it in a Card, grid, or page header.
 */
export const Statistic = forwardRef<HTMLDivElement, StatisticProps>(function Statistic(
  {
    label,
    value,
    unit,
    size = 'md',
    delta,
    positiveIs = 'neither',
    comparison,
    format,
    locale = DEFAULT_LOCALE,
    href,
    onClick,
    spark,
    loading = false,
    error = false,
    announceUpdates = false,
    className,
    ...props
  },
  ref,
) {
  const nf = new Intl.NumberFormat(locale, format);
  const valueText = nf.format(value);
  const isCompact = format?.notation === 'compact';
  const exactText = isCompact ? new Intl.NumberFormat(locale).format(value) : valueText;

  const hasDelta = delta !== undefined && !loading && !error;
  const direction = hasDelta ? (Math.sign(delta) as -1 | 0 | 1) : 0;
  const sentiment = hasDelta ? sentimentOf(delta, positiveIs) : 'neutral';
  const deltaText = hasDelta ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(delta)) : '';

  const announcement = (() => {
    if (loading) return `${label}: loading`;
    if (error) return `${label}: data unavailable`;
    const head = `${label}: ${exactText}${unit ? ` ${unit}` : ''}`;
    if (!hasDelta) return head;
    const dir = direction > 0 ? 'up' : direction < 0 ? 'down' : 'unchanged';
    const mood = sentiment === 'good' ? ', improving' : sentiment === 'bad' ? ', worsening' : '';
    return `${head}, ${dir} ${deltaText}${comparison ? ` versus ${comparison}` : ''}${mood}`;
  })();

  const interactive = href !== undefined || onClick !== undefined;
  const Wrapper = (href !== undefined ? 'a' : interactive ? 'button' : 'div') as ElementType;
  const wrapperProps = href !== undefined ? { href } : interactive ? { type: 'button' as const, onClick } : {};

  return (
    <Wrapper
      ref={ref}
      className={cn(styles.root, className)}
      data-size={size}
      data-interactive={interactive || undefined}
      aria-label={interactive ? announcement : undefined}
      {...wrapperProps}
      {...props}
    >
      <div className={styles.visual} aria-hidden='true'>
        <span className={styles.label}>{label}</span>
        <span className={styles.valueRow}>
          {loading ? (
            <Skeleton className={styles.valueSkeleton} shape='rect' />
          ) : error ? (
            <span className={styles.value} title='Data unavailable'>
              —
            </span>
          ) : (
            <span key={valueText} className={styles.value} title={isCompact ? exactText : undefined}>
              {valueText}
            </span>
          )}
          {unit && !loading && !error ? <span className={styles.unit}>{unit}</span> : null}
          {spark ? <span className={styles.spark}>{spark}</span> : null}
        </span>
        {hasDelta ? (
          <span className={styles.deltaRow}>
            <span className={styles.delta} data-sentiment={sentiment}>
              <DeltaArrow direction={direction} />
              {deltaText}
            </span>
            {comparison ? <span className={styles.comparison}>{comparison}</span> : null}
          </span>
        ) : null}
      </div>
      {interactive ? null : (
        <span className={styles.srOnly} aria-live={announceUpdates ? 'polite' : undefined}>
          {announcement}
        </span>
      )}
    </Wrapper>
  );
});
