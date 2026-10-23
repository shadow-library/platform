import { type ReactNode } from 'react';

export type GridAlign = 'start' | 'center' | 'end';

export interface GridSort {
  id: string;
  direction: 'asc' | 'desc';
}

export interface GridColumn<T> {
  id: string;
  header: ReactNode;
  cell?: (row: T) => ReactNode;
  /** String value for the inline editor; defaults to `String(row[id])`. */
  accessor?: (row: T) => string;
  align?: GridAlign;
  sortable?: boolean;
  editable?: boolean;
  /** Initial width in px. @default 160 */
  width?: number;
  /** Minimum width when resizing. @default 64 */
  minWidth?: number;
}

export interface DataGridProps<T> {
  data: T[];
  columns: GridColumn<T>[];
  rowKey: keyof T | ((row: T) => string);
  /** Fires when an inline edit commits. */
  onCellEdit?: (rowKey: string, columnId: string, value: string) => void;
  /** Fires with the next multi-column sort (empty when cleared). */
  onSortChange?: (sort: GridSort[]) => void;
  /** Row height scale. @default 'comfortable' */
  density?: 'comfortable' | 'compact';
  caption?: ReactNode;
  'aria-label'?: string;
}
