/**
 * Importing npm packages
 */
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Skeleton.module.css';
import { type SkeletonCardProps, type SkeletonListProps, type SkeletonProps, type SkeletonTableProps } from './Skeleton.types';

/**
 * A ghost placeholder that reserves the exact space of the content it stands in for, so its arrival
 * shifts nothing. Purely decorative (`aria-hidden`) — the loading region carries `aria-busy`, so
 * screen readers hear "busy", not the ghosts. Match its dimensions to the real element.
 */
const SkeletonRoot = forwardRef<HTMLSpanElement, SkeletonProps>(function Skeleton({ shape = 'line', width, height, radius, className, style, ...props }, ref) {
  const resolvedHeight = height ?? (shape === 'circle' ? width : undefined);
  return (
    <span
      ref={ref}
      className={cn(styles.skeleton, className)}
      data-shape={shape}
      aria-hidden="true"
      style={{ width, height: resolvedHeight, borderRadius: radius, ...style }}
      {...props}
    />
  );
});

/** Prebuilt table ghost — a grid of line skeletons in a busy region. */
function SkeletonTable({ rows = 5, columns = 4, className, ...props }: SkeletonTableProps) {
  return (
    <div className={cn(styles.table, className)} aria-busy="true" {...props}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={`row-${row}`} className={styles.tableRow}>
          {Array.from({ length: columns }, (_, col) => (
            <SkeletonRoot key={`cell-${col}`} shape="line" width={col === 0 ? '45%' : '75%'} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Prebuilt card ghost — a media block over two text lines. */
function SkeletonCard({ className, ...props }: SkeletonCardProps) {
  return (
    <div className={cn(styles.card, className)} aria-busy="true" {...props}>
      <SkeletonRoot shape="rect" height={120} radius="var(--sh-radius-md)" />
      <SkeletonRoot shape="line" width="70%" />
      <SkeletonRoot shape="line" width="45%" />
    </div>
  );
}

/** Prebuilt list ghost — rows of avatar + two text lines. */
function SkeletonList({ rows = 3, className, ...props }: SkeletonListProps) {
  return (
    <div className={cn(styles.list, className)} aria-busy="true" {...props}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={`row-${row}`} className={styles.listRow}>
          <SkeletonRoot shape="circle" width={32} />
          <div className={styles.listText}>
            <SkeletonRoot shape="line" width="60%" />
            <SkeletonRoot shape="line" width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

export const Skeleton = Object.assign(SkeletonRoot, {
  Table: SkeletonTable,
  Card: SkeletonCard,
  List: SkeletonList,
});
