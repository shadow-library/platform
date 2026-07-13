/**
 * Importing npm packages
 */
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn, DEFAULT_LOCALE } from '@/lib';

import { Select } from '../Select';
import styles from './Pagination.module.css';
import { type PaginationProps } from './Pagination.types';

/**
 * Declaring the constants
 */
type PageSlot = number | 'ellipsis-left' | 'ellipsis-right';

function ChevronLeft() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M10 4L6 8l4 4' />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M6 4l4 4-4 4' />
    </svg>
  );
}

/** Windowed page list — first + last + current ± siblingCount, with ellipses filling the gaps. */
function getPageSlots(page: number, totalPages: number, siblingCount: number): PageSlot[] {
  const totalSlots = siblingCount * 2 + 5;
  if (totalPages <= totalSlots) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const left = Math.max(page - siblingCount, 1);
  const right = Math.min(page + siblingCount, totalPages);
  const slots: PageSlot[] = [1];

  if (left > 2) slots.push('ellipsis-left');
  else for (let index = 2; index < left; index++) slots.push(index);

  for (let index = left; index <= right; index++) {
    if (index !== 1 && index !== totalPages) slots.push(index);
  }

  if (right < totalPages - 1) slots.push('ellipsis-right');
  else for (let index = right + 1; index < totalPages; index++) slots.push(index);

  slots.push(totalPages);
  return slots;
}

/**
 * Table-footer pagination with the windowing math built in (siblingCount, ellipses) so products never
 * reimplement it. Page mode renders the numbered window with a range summary; cursor mode (no `total`)
 * renders only Prev/Next. The current page is a position marker — `aria-current="page"`, accent-soft,
 * not a disabled or clickable-looking control. Wrapped in `<nav aria-label="Pagination">`.
 */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination(
  {
    page = 1,
    onPageChange,
    total,
    pageSize = 50,
    onPageSizeChange,
    pageSizeOptions = [25, 50, 100],
    siblingCount = 1,
    summary = true,
    compact = false,
    locale = DEFAULT_LOCALE,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    className,
    ...props
  },
  ref,
) {
  const cursorMode = total == null;

  if (cursorMode) {
    return (
      <nav ref={ref} className={cn(styles.root, className)} aria-label='Pagination' {...props}>
        <div className={styles.controls}>
          <button type='button' className={styles.arrow} disabled={!hasPrev} aria-label='Previous page' onClick={onPrev}>
            <ChevronLeft />
          </button>
          <button type='button' className={styles.arrow} disabled={!hasNext} aria-label='Next page' onClick={onNext}>
            <ChevronRight />
          </button>
        </div>
      </nav>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages < 2 && !onPageSizeChange) return null;

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const slots = getPageSlots(page, totalPages, siblingCount);

  return (
    <nav ref={ref} className={cn(styles.root, className)} aria-label='Pagination' {...props}>
      {summary ? (
        <span className={styles.summary} aria-live='polite'>
          Showing {start.toLocaleString(locale)} to {end.toLocaleString(locale)} of {total.toLocaleString(locale)}
        </span>
      ) : null}

      <div className={styles.controls}>
        <button type='button' className={styles.arrow} disabled={page <= 1} aria-label='Previous page' onClick={() => onPageChange?.(page - 1)}>
          <ChevronLeft />
        </button>

        {compact ? (
          <span className={styles.compact}>
            {page} / {totalPages}
          </span>
        ) : (
          slots.map(slot =>
            typeof slot === 'number' ? (
              <button
                key={slot}
                type='button'
                className={styles.page}
                data-current={slot === page || undefined}
                aria-label={`Page ${slot}`}
                aria-current={slot === page ? 'page' : undefined}
                onClick={() => onPageChange?.(slot)}
              >
                {slot}
              </button>
            ) : (
              <span key={slot} className={styles.ellipsis} aria-hidden='true'>
                …
              </span>
            ),
          )
        )}

        <button type='button' className={styles.arrow} disabled={page >= totalPages} aria-label='Next page' onClick={() => onPageChange?.(page + 1)}>
          <ChevronRight />
        </button>
      </div>

      {onPageSizeChange ? (
        <Select className={styles.pageSize} value={String(pageSize)} onValueChange={next => onPageSizeChange(Number(next))} size='sm' aria-label='Rows per page'>
          {pageSizeOptions.map(option => (
            <Select.Item key={option} value={String(option)}>
              {option} / page
            </Select.Item>
          ))}
        </Select>
      ) : null}
    </nav>
  );
});
