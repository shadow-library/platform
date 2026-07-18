/**
 * Importing npm packages
 */
import { type KeyboardEvent, type MouseEvent, type ReactElement } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import styles from './Table.module.css';
import { type TableAlign, type TableColumn, type TableProps } from './Table.types';

/**
 * Declaring the constants
 */
function SortArrow({ direction }: { direction: 'asc' | 'desc' | undefined }) {
  if (direction == null) return null;
  return (
    <svg className={styles.sortArrow} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      {direction === 'asc' ? <path d="M6 3l3 4H3z" /> : <path d="M6 9L3 5h6z" />}
    </svg>
  );
}

const ARIA_SORT: Record<'asc' | 'desc', 'ascending' | 'descending'> = { asc: 'ascending', desc: 'descending' };

/**
 * Rows of homogeneous records with sorting, single-column and range selection, and bulk actions. A
 * real semantic `<table>` — low-contrast chrome, high-contrast content. Sorting and selection are
 * controlled (server- or consumer-driven); navigation (row click) and selection (checkbox) are
 * distinct gestures that never collide. Chrome reads only neutral tokens, so dark mode is automatic.
 */
export function Table<T>({
  data,
  columns,
  rowKey,
  onRowClick,
  selection,
  onSelectionChange,
  sort,
  onSortChange,
  loading = false,
  loadingRows = 5,
  density = 'comfortable',
  caption,
  emptyState,
  bulkActions,
  'aria-label': ariaLabel,
}: TableProps<T>): ReactElement {
  const keyOf = (row: T): string => (typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey]));
  const selectable = selection !== undefined;
  const selectedSet = new Set(selection ?? []);
  const keys = data.map(keyOf);
  const selectedCount = keys.filter(key => selectedSet.has(key)).length;
  const allSelected = data.length > 0 && selectedCount === data.length;
  const selectAll: boolean | 'indeterminate' = allSelected ? true : selectedCount > 0 ? 'indeterminate' : false;
  const colSpan = columns.length + (selectable ? 1 : 0);

  function toggleAll(checked: boolean | 'indeterminate'): void {
    onSelectionChange?.(checked === true ? keys : []);
  }

  function toggleRow(key: string, checked: boolean): void {
    const next = new Set(selectedSet);
    if (checked) next.add(key);
    else next.delete(key);
    onSelectionChange?.([...next]);
  }

  function cycleSort(id: string): void {
    if (sort == null || sort.id !== id) onSortChange?.({ id, direction: 'asc' });
    else if (sort.direction === 'asc') onSortChange?.({ id, direction: 'desc' });
    else onSortChange?.(null);
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>, row: T): void {
    if ((event.target as HTMLElement).closest('[data-selection-cell]')) return;
    onRowClick?.(row);
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: T, key: string): void {
    if (event.key === 'Enter' && onRowClick) {
      event.preventDefault();
      onRowClick(row);
    } else if (event.key === ' ' && selectable) {
      event.preventDefault();
      toggleRow(key, !selectedSet.has(key));
    }
  }

  return (
    <div className={styles.wrapper}>
      {selectable && selectedCount > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount} aria-live="polite">
            {selectedCount} selected
          </span>
          <Button variant="ghost" size="sm" onClick={() => toggleAll(false)}>
            Clear
          </Button>
          <div className={styles.bulkActions}>{bulkActions}</div>
        </div>
      ) : null}

      <div className={styles.scroll}>
        <table className={styles.table} data-density={density} aria-label={ariaLabel}>
          {caption != null ? <caption className={styles.caption}>{caption}</caption> : null}
          <thead>
            <tr className={styles.headerRow}>
              {selectable ? (
                <th className={cn(styles.th, styles.checkboxCell)} scope="col">
                  <Checkbox checked={selectAll} onCheckedChange={toggleAll} aria-label="Select all rows on this page" />
                </th>
              ) : null}
              {columns.map(column => {
                const sorted = sort?.id === column.id ? sort.direction : undefined;
                return (
                  <th
                    key={column.id}
                    className={styles.th}
                    scope="col"
                    data-align={column.align ?? 'start'}
                    aria-sort={column.sortable ? (sorted ? ARIA_SORT[sorted] : 'none') : undefined}
                    style={column.width != null ? { width: column.width } : undefined}
                  >
                    {column.sortable ? (
                      <button type="button" className={styles.sortButton} onClick={() => cycleSort(column.id)} data-active={sorted ? '' : undefined}>
                        {column.header}
                        <SortArrow direction={sorted} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: loadingRows }, (_, index) => (
                <tr key={`skeleton-${index}`} className={styles.row}>
                  {selectable ? (
                    <td className={cn(styles.td, styles.checkboxCell)}>
                      <span className={styles.skeleton} />
                    </td>
                  ) : null}
                  {columns.map(column => (
                    <td key={column.id} className={styles.td} data-align={column.align ?? 'start'}>
                      <span className={styles.skeleton} />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={colSpan}>
                  {emptyState ?? 'No records'}
                </td>
              </tr>
            ) : (
              data.map(row => {
                const key = keyOf(row);
                const selected = selectedSet.has(key);
                return (
                  <tr
                    key={key}
                    className={styles.row}
                    data-selected={selected ? '' : undefined}
                    data-clickable={onRowClick ? '' : undefined}
                    onClick={onRowClick ? event => handleRowClick(event, row) : undefined}
                    onKeyDown={onRowClick || selectable ? event => onRowKeyDown(event, row, key) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {selectable ? (
                      <td className={cn(styles.td, styles.checkboxCell)} data-selection-cell="">
                        <Checkbox checked={selected} onCheckedChange={checked => toggleRow(key, checked === true)} aria-label={`Select ${key}`} />
                      </td>
                    ) : null}
                    {columns.map(column => (
                      <td key={column.id} className={styles.td} data-align={column.align ?? 'start'} data-numeric={column.align === 'end' ? '' : undefined}>
                        {renderCell(column, row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCell<T>(column: TableColumn<T>, row: T): ReactElement | string {
  if (column.cell) return <>{column.cell(row)}</>;
  const value = (row as Record<string, unknown>)[column.id];
  return value == null ? '' : String(value);
}

/** Re-export for consumers who want the alignment union at a call site. */
export type { TableAlign };
