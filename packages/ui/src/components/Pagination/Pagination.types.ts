/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef } from 'react';

/**
 * Defining types
 */
export interface PaginationProps extends Omit<ComponentPropsWithoutRef<'nav'>, 'onChange'> {
  /** Current 1-based page (page mode). */
  page?: number;
  /** Fires with the next page. */
  onPageChange?: (page: number) => void;
  /** Total item count — drives the page count and range summary. */
  total?: number;
  /** Items per page. @default 50 */
  pageSize?: number;
  /** Fires when the page size changes; presence renders the page-size Select. */
  onPageSizeChange?: (size: number) => void;
  /** Page-size options. @default [25, 50, 100] */
  pageSizeOptions?: number[];
  /** Pages shown on each side of the current page. @default 1 */
  siblingCount?: number;
  /** Show the "Showing X to Y of Z" range summary (page mode with a known total). @default true */
  summary?: boolean;
  /** Collapse to arrows + "page / total" text. @default false */
  compact?: boolean;
  /** Locale for the range-summary numbers. Pinned by default so SSR and client agree. @default 'en-US' */
  locale?: string;
  /** Cursor mode — render only Prev/Next (no page numbers) when `total` is unknown. */
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}
