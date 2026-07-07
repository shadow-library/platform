/**
 * Importing npm packages
 */
import { forwardRef, type ReactNode, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { IconButton } from '../IconButton';
import { toast } from '../Toast';
import styles from './DescriptionList.module.css';
import { type DescriptionListItemProps, type DescriptionListProps } from './DescriptionList.types';

/**
 * Declaring the constants
 */
function CopyIcon() {
  return (
    <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <rect x='5' y='5' width='8' height='8' rx='1.5' />
      <path d='M11 5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5.5A1.5 1.5 0 0 0 4 11h1' />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth={2} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M3 8.5l3.5 3.5L13 5' />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M1.5 8S3.5 3.5 8 3.5 14.5 8 14.5 8 12.5 12.5 8 12.5 1.5 8 1.5 8Z' />
      <circle cx='8' cy='8' r='2' />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M6.5 4A5.7 5.7 0 0 1 8 3.5C12.5 3.5 14.5 8 14.5 8a11 11 0 0 1-1.6 2.3M4 5.2A11 11 0 0 0 1.5 8S3.5 12.5 8 12.5a5.7 5.7 0 0 0 2-.35' />
      <path d='M2 2l12 12' />
    </svg>
  );
}

function isEmptyValue(children: ReactNode): boolean {
  return children === undefined || children === null || children === false || children === '';
}

/**
 * One key–value fact — a `<dt>`/`<dd>` pair. Empty children render the em-dash policy automatically, so
 * call sites never carry a `?? '—'` ternary. `copyable` reveals a copy button on hover/focus; `masked`
 * hides the value behind a reveal toggle whose state never persists. Both affordances read the value's
 * real text, so they compose with any value type.
 */
function DescriptionListItem({ term, mono = false, copyable = false, masked = false, className, children, ...props }: DescriptionListItemProps) {
  const empty = isEmptyValue(children);
  const valueRef = useRef<HTMLSpanElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const showMask = masked && !revealed;

  const copyLabel = typeof term === 'string' ? `Copy ${term}` : 'Copy value';
  const revealLabel = typeof term === 'string' ? `Show ${term}` : 'Show value';

  function copy(): void {
    const text = valueRef.current?.textContent ?? '';
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    toast.success('Copied');
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={cn(styles.item, className)} {...props}>
      <dt className={styles.term}>{term}</dt>
      <dd className={styles.detail}>
        {empty ? (
          <span className={styles.empty}>—</span>
        ) : (
          <>
            {showMask ? (
              <span className={styles.masked}>
                <span aria-hidden='true'>••••••••</span>
                <span className={styles.srOnly}>hidden</span>
              </span>
            ) : null}
            <span ref={valueRef} className={styles.value} data-mono={mono || undefined} data-hidden={showMask || undefined} aria-hidden={showMask || undefined}>
              {children}
            </span>
            {masked ? (
              <IconButton
                className={styles.action}
                size='sm'
                variant='ghost'
                icon={revealed ? <EyeOffIcon /> : <EyeIcon />}
                aria-label={revealed ? `Hide ${typeof term === 'string' ? term : 'value'}` : revealLabel}
                onClick={() => setRevealed(v => !v)}
              />
            ) : null}
            {copyable ? (
              <IconButton className={cn(styles.action, styles.copy)} size='sm' variant='ghost' icon={copied ? <CheckIcon /> : <CopyIcon />} aria-label={copyLabel} onClick={copy} />
            ) : null}
          </>
        )}
      </dd>
    </div>
  );
}

/**
 * The standard rendering of key–value facts in three layouts. `row` is the detail-panel default (fixed
 * term column + hairline dividers); `column` stacks term over value for narrow contexts; `grid` tiles
 * facts across columns and degrades as width narrows. Semantic `<dl>` in every layout — the arrangement
 * is CSS, the term–detail association is markup. It renders facts; it is not a form.
 */
const DescriptionListRoot = forwardRef<HTMLDListElement, DescriptionListProps>(function DescriptionList(
  { layout = 'row', termWidth = 150, columns = 2, title, action, className, children, style, ...props },
  ref,
) {
  const hasHeader = title != null || action != null;
  return (
    <div className={styles.root}>
      {hasHeader ? (
        <div className={styles.header}>
          {title != null ? <div className={styles.title}>{title}</div> : null}
          {action != null ? <div className={styles.headerAction}>{action}</div> : null}
        </div>
      ) : null}
      <dl
        ref={ref}
        className={cn(styles.list, className)}
        data-layout={layout}
        style={{ '--dl-term-width': `${termWidth}px`, '--dl-columns': columns, ...style } as React.CSSProperties}
        {...props}
      >
        {children}
      </dl>
    </div>
  );
});

export const DescriptionList = Object.assign(DescriptionListRoot, { Item: DescriptionListItem });
