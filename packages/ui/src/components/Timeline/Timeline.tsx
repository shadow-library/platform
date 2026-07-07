/**
 * Importing npm packages
 */
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Timeline.module.css';
import { type TimelineItemProps, type TimelineProps, type TimelineStatus } from './Timeline.types';

/**
 * Declaring the constants
 */
const STATUS_LABEL: Record<TimelineStatus, string> = {
  default: '',
  completed: 'Completed',
  current: 'Current',
  upcoming: 'Upcoming',
  success: 'Success',
  warning: 'Warning',
  danger: 'Failed',
};

function CheckGlyph() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={2.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M3.5 8.5l3 3 6-6.5' />
    </svg>
  );
}
function BangGlyph() {
  return (
    <svg viewBox='0 0 16 16' fill='currentColor' aria-hidden='true'>
      <path d='M7 3h2l-.4 5.5H7.4L7 3Zm1 7.5a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z' />
    </svg>
  );
}

/**
 * A vertical chronology as a semantic ordered list — order is the meaning, and lists announce
 * position and count for free. The timeline is a document, not a widget: no roving focus or selection;
 * interactive elements inside entries are ordinary tab stops. Deliberately vertical-only (a horizontal
 * process is a Stepper). The marker vocabulary reads via a visually-hidden status prefix, never color.
 */
const TimelineRoot = forwardRef<HTMLOListElement, TimelineProps>(function Timeline({ className, ...props }, ref) {
  return <ol ref={ref} className={cn(styles.root, className)} {...props} />;
});

/** One chronological entry: a marker, a title with timestamp, and optional detail content. */
export const TimelineItem = forwardRef<HTMLLIElement, TimelineItemProps>(function TimelineItem(
  { status = 'default', marker, title, timestamp, className, children, ...props },
  ref,
) {
  const label = STATUS_LABEL[status];
  const glyph = status === 'completed' || status === 'success' ? <CheckGlyph /> : status === 'warning' || status === 'danger' ? <BangGlyph /> : null;

  return (
    <li ref={ref} className={cn(styles.item, className)} data-status={status} {...props}>
      <div className={styles.marker} aria-hidden='true'>
        {marker ?? glyph}
      </div>
      <div className={styles.content}>
        <div className={styles.head}>
          <span className={styles.title}>
            {label ? <span className={styles.srOnly}>{label}: </span> : null}
            {title}
          </span>
          {timestamp != null ? <span className={styles.timestamp}>{timestamp}</span> : null}
        </div>
        {children != null ? <div className={styles.detail}>{children}</div> : null}
      </div>
    </li>
  );
});

export const Timeline = Object.assign(TimelineRoot, { Item: TimelineItem });
