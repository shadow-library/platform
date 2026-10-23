import { type ReactNode } from 'react';

export type TableAlign = 'start' | 'center' | 'end';
export type SortDirection = 'asc' | 'desc';
export type TableDensity = 'comfortable' | 'compact' | 'relaxed';

export interface TableSort {
  id: string;
  direction: SortDirection;
}

export interface TableColumn<T> {
  /** Stable column id — also the default data key (`row[id]`) when no `cell` is given. */
  id: string;
  header: ReactNode;
  cell?: (row: T) => ReactNode;
  /** Text alignment — use `end` for numbers. @default 'start' */
  align?: TableAlign;
  sortable?: boolean;
  /** Fixed column width (px number or CSS length). */
  width?: number | string;
  /** Lower numbers drop first as width shrinks (reserved for responsive column dropping). */
  priority?: number;
}

export interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  rowKey: keyof T | ((row: T) => string);
  /** Row activation (opens the record). The checkbox cell never triggers this. */
  onRowClick?: (row: T) => void;
  /** Controlled selection — the selected row keys. Presence enables the selection column. */
  selection?: string[];
  /** Fires with the next selection. */
  onSelectionChange?: (keys: string[]) => void;
  /** Controlled single-column sort. */
  sort?: TableSort | null;
  /** Fires with the next sort (`null` when cycled off). */
  onSortChange?: (sort: TableSort | null) => void;
  loading?: boolean;
  /** Skeleton row count while loading. @default 5 */
  loadingRows?: number;
  /** Row height scale. @default 'comfortable' */
  density?: TableDensity;
  /** Accessible name for the table (screen-reader table navigation). */
  'aria-label'?: string;
  caption?: ReactNode;
  emptyState?: ReactNode;
  /** Actions shown in the bulk bar that replaces the toolbar while a selection exists. */
  bulkActions?: ReactNode;
}
