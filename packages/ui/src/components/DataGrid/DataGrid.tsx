/**
 * Importing npm packages
 */
import { type KeyboardEvent, type PointerEvent, type ReactElement, useEffect, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import styles from './DataGrid.module.css';
import { type DataGridProps, type GridColumn, type GridSort } from './DataGrid.types';

/**
 * Declaring the constants
 */
const ARIA_SORT: Record<'asc' | 'desc', 'ascending' | 'descending'> = { asc: 'ascending', desc: 'descending' };

function cellValue<T>(column: GridColumn<T>, row: T): string {
  if (column.accessor) return column.accessor(row);
  const value = (row as Record<string, unknown>)[column.id];
  return value == null ? '' : String(value);
}

/**
 * Table's editable-grid extension: the ARIA grid pattern (role grid/gridcell, one tab stop, arrow-key
 * cell navigation) layered with resizable columns, per-cell inline editing (Enter/type to edit, Esc
 * reverts, Tab commits + moves), and multi-column sort with ordinal superscripts. The Grid inherits
 * Table's tokens; virtualization, pinning, and grouping are further layers not enabled here.
 */
export function DataGrid<T>({ data, columns, rowKey, onCellEdit, onSortChange, density = 'comfortable', caption, 'aria-label': ariaLabel }: DataGridProps<T>): ReactElement {
  const keyOf = (row: T): string => (typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey]));

  const [widths, setWidths] = useState<Record<string, number>>({});
  const [sort, setSort] = useState<GridSort[]>([]);
  const [focused, setFocused] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null);
  const [draft, setDraft] = useState('');

  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const resizeRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  const widthOf = (column: GridColumn<T>): number => widths[column.id] ?? column.width ?? 160;

  useEffect(() => {
    if (editing) return;
    cellRefs.current.get(`${focused.r}-${focused.c}`)?.focus();
  }, [focused, editing]);

  useEffect(() => {
    function onMove(event: globalThis.PointerEvent): void {
      const state = resizeRef.current;
      if (!state) return;
      const column = columns.find(candidate => candidate.id === state.id);
      const next = Math.max(column?.minWidth ?? 64, state.startWidth + (event.clientX - state.startX));
      setWidths(prev => ({ ...prev, [state.id]: next }));
    }
    function onUp(): void {
      resizeRef.current = null;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [columns]);

  function startResize(event: PointerEvent, column: GridColumn<T>): void {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { id: column.id, startX: event.clientX, startWidth: widthOf(column) };
  }

  function toggleSort(id: string, append: boolean): void {
    setSort(prev => {
      const index = prev.findIndex(entry => entry.id === id);
      let next: GridSort[];
      if (index < 0) {
        const added: GridSort = { id, direction: 'asc' };
        next = append ? [...prev, added] : [added];
      } else if (prev[index]?.direction === 'asc') {
        next = append ? prev.map(entry => (entry.id === id ? { id, direction: 'desc' } : entry)) : [{ id, direction: 'desc' }];
      } else {
        next = append ? prev.filter(entry => entry.id !== id) : [];
      }
      onSortChange?.(next);
      return next;
    });
  }

  function beginEdit(r: number, c: number, initial?: string): void {
    const column = columns[c];
    const row = data[r];
    if (!column?.editable || !row) return;
    setDraft(initial ?? cellValue(column, row));
    setEditing({ r, c });
  }

  function commitEdit(): void {
    if (!editing) return;
    const column = columns[editing.c];
    const row = data[editing.r];
    if (column && row) onCellEdit?.(keyOf(row), column.id, draft);
    setEditing(null);
  }

  function move(dr: number, dc: number): void {
    setFocused(prev => ({ r: Math.max(0, Math.min(data.length - 1, prev.r + dr)), c: Math.max(0, Math.min(columns.length - 1, prev.c + dc)) }));
  }

  function handleCellKeyDown(event: KeyboardEvent, r: number, c: number): void {
    if (editing) return;
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        move(0, 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        move(0, -1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        move(1, 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1, 0);
        break;
      case 'Enter':
      case 'F2':
        if (columns[c]?.editable) {
          event.preventDefault();
          beginEdit(r, c);
        }
        break;
      default:
        if (event.key.length === 1 && columns[c]?.editable && !event.metaKey && !event.ctrlKey) beginEdit(r, c, event.key);
    }
  }

  function handleEditorKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditing(null);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit();
      move(0, event.shiftKey ? -1 : 1);
    }
  }

  return (
    <div className={styles.wrapper}>
      {caption != null ? <div className={styles.caption}>{caption}</div> : null}
      <div className={styles.scroll}>
        {/* an editable data grid is the WAI-ARIA grid pattern — <table role="grid"> with focusable gridcells */}
        <table className={styles.grid} role="grid" aria-label={ariaLabel} aria-rowcount={data.length + 1} aria-colcount={columns.length}>
          <colgroup>
            {columns.map(column => (
              <col key={column.id} style={{ width: widthOf(column) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map(column => {
                const sortIndex = sort.findIndex(entry => entry.id === column.id);
                const sorted = sortIndex >= 0 ? sort[sortIndex]?.direction : undefined;
                return (
                  <th
                    key={column.id}
                    className={styles.headerCell}
                    scope="col"
                    data-align={column.align ?? 'start'}
                    aria-sort={column.sortable ? (sorted ? ARIA_SORT[sorted] : 'none') : undefined}
                  >
                    {column.sortable ? (
                      <button type="button" className={styles.headerButton} onClick={event => toggleSort(column.id, event.shiftKey)}>
                        {column.header}
                        {sorted ? (
                          <span className={styles.sortMark}>
                            {sorted === 'asc' ? '▲' : '▼'}
                            {sort.length > 1 ? <sup>{sortIndex + 1}</sup> : null}
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      column.header
                    )}
                    <span className={styles.resizeHandle} onPointerDown={event => startResize(event, column)} aria-hidden="true" />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((row, r) => (
              <tr key={keyOf(row)} className={styles.row} data-density={density}>
                {columns.map((column, c) => {
                  const isFocused = focused.r === r && focused.c === c;
                  const isEditing = editing?.r === r && editing?.c === c;
                  return (
                    <td
                      key={column.id}
                      ref={node => {
                        const mapKey = `${r}-${c}`;
                        if (node) cellRefs.current.set(mapKey, node);
                        else cellRefs.current.delete(mapKey);
                      }}
                      className={styles.cell}
                      data-align={column.align ?? 'start'}
                      data-editable={column.editable || undefined}
                      tabIndex={isFocused && !isEditing ? 0 : -1}
                      onFocus={() => setFocused({ r, c })}
                      onDoubleClick={() => beginEdit(r, c)}
                      onKeyDown={event => handleCellKeyDown(event, r, c)}
                    >
                      {isEditing ? (
                        <input
                          className={styles.editor}
                          // focus must enter the just-opened cell editor immediately
                          autoFocus
                          value={draft}
                          aria-label={`Edit ${cellValue(column, row)}`}
                          onChange={event => setDraft(event.target.value)}
                          onKeyDown={handleEditorKeyDown}
                          onBlur={commitEdit}
                        />
                      ) : column.cell ? (
                        column.cell(row)
                      ) : (
                        cellValue(column, row)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
